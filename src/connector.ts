import { createHash, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AtlasDatabase } from "./db.js";
import { id, json, now, parseJson } from "./util.js";

type Row = Record<string, any>;
export type DeviceAuth = { deviceId: string; timestamp: string; nonce: string; signature: string };
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const canonical=(auth:Omit<DeviceAuth,"signature">,body:unknown)=>[auth.deviceId,auth.timestamp,auth.nonce,hash(json(body??{}))].join("\n");

export class ConnectorService {
  private readonly privateKey:string;
  readonly publicKey:string;
  constructor(private readonly db:AtlasDatabase,root=process.cwd()){
    const dir=path.join(root,"data"); mkdirSync(dir,{recursive:true});
    const keyFile=path.join(dir,"connector-signing-key.pem");
    if(!existsSync(keyFile)){const pair=generateKeyPairSync("ed25519");writeFileSync(keyFile,pair.privateKey.export({type:"pkcs8",format:"pem"}).toString(),{mode:0o600});writeFileSync(path.join(dir,"connector-signing-key.pub.pem"),pair.publicKey.export({type:"spki",format:"pem"}).toString());}
    this.privateKey=readFileSync(keyFile,"utf8");
    this.publicKey=readFileSync(path.join(dir,"connector-signing-key.pub.pem"),"utf8");
  }
  createEnrollment(input:{name:string;expiresInMinutes?:number}){
    const name=String(input.name??"").trim(); if(!name)throw new Error("Environment name is required.");
    const environmentId=id("env"),managerId=id("mgr"),token=randomBytes(32).toString("base64url"),timestamp=now();
    const expiresAt=new Date(Date.now()+Math.min(60,Math.max(1,input.expiresInMinutes??15))*60000).toISOString();
    this.db.transaction(()=>{this.db.run("INSERT INTO environments(id,name,kind,endpoint,status,capabilities_json,health_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",environmentId,name,"cloud",null,"awaiting_enrollment","{}",json({status:"awaiting_enrollment",workload:0,recovery:"waiting",checkedAt:timestamp}),timestamp,timestamp);this.db.run("INSERT INTO managers(id,environment_id,name,status,last_heartbeat,created_at) VALUES(?,?,?,?,?,?)",managerId,environmentId,name+" Manager","waiting",timestamp,timestamp);this.db.run("INSERT INTO enrollment_tokens(id,environment_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",id("enroll"),environmentId,hash(token),expiresAt,timestamp);});
    return {environmentId,managerId,token,expiresAt};
  }
  enroll(input:{token:string;publicKey:string;capabilities?:Record<string,unknown>}){
    const record=this.db.get<Row>("SELECT * FROM enrollment_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?",hash(String(input.token??"")),now());if(!record)throw new Error("Invalid, expired, or already-used enrollment token.");
    try{verify(null,Buffer.from("probe"),input.publicKey,Buffer.alloc(64));}catch{throw new Error("A valid Ed25519 device public key is required.");}
    const deviceId=id("device"),timestamp=now();
    this.db.transaction(()=>{this.db.run("UPDATE enrollment_tokens SET used_at=? WHERE id=?",timestamp,record.id);this.db.run("INSERT INTO environment_devices(id,environment_id,public_key,status,enrolled_at,last_seen_at) VALUES(?,?,?,?,?,?)",deviceId,record.environment_id,input.publicKey,"active",timestamp,timestamp);this.db.run("UPDATE environments SET status='online',capabilities_json=?,health_json=?,updated_at=? WHERE id=?",json(input.capabilities??{}),json({status:"online",workload:0,recovery:"connected",checkedAt:timestamp}),timestamp,record.environment_id);this.db.run("UPDATE managers SET status='online',last_heartbeat=? WHERE environment_id=?",timestamp,record.environment_id);});
    return {deviceId,environmentId:record.environment_id,controlPlanePublicKey:this.publicKey,protocol:"atlas-connector/v1",pollAfterMs:2000};
  }
  authenticate(auth:DeviceAuth,body:unknown){
    const device=this.db.get<Row>("SELECT * FROM environment_devices WHERE id=?",auth.deviceId);if(!device||device.status!=="active")throw new Error("Device is unknown or revoked.");
    const time=new Date(auth.timestamp).getTime();if(!Number.isFinite(time)||Math.abs(Date.now()-time)>300000)throw new Error("Device request timestamp is outside the allowed window.");
    if(this.db.get("SELECT 1 FROM connector_nonces WHERE device_id=? AND nonce=?",auth.deviceId,auth.nonce))throw new Error("Replay detected.");
    const unsigned={deviceId:auth.deviceId,timestamp:auth.timestamp,nonce:auth.nonce};if(!verify(null,Buffer.from(canonical(unsigned,body)),device.public_key,Buffer.from(auth.signature,"base64url")))throw new Error("Invalid device signature.");
    this.db.run("INSERT INTO connector_nonces(device_id,nonce,seen_at) VALUES(?,?,?)",auth.deviceId,auth.nonce,now());this.db.run("DELETE FROM connector_nonces WHERE seen_at<?",new Date(Date.now()-3600000).toISOString());return device;
  }
  queueCommand(input:{environmentId:string;type:string;payload?:unknown;capabilities?:string[];ttlSeconds?:number}){
    const device=this.db.get<Row>("SELECT * FROM environment_devices WHERE environment_id=?",input.environmentId);if(!device||device.status!=="active")throw new Error("Environment has no active connector device.");
    const sequence=(this.db.get<Row>("SELECT COALESCE(MAX(sequence),0)+1 next FROM connector_commands WHERE environment_id=?",input.environmentId)?.next??1) as number;
    const command={id:id("cmd"),environmentId:input.environmentId,sequence,type:String(input.type),payload:input.payload??{},capabilities:input.capabilities??[],expiresAt:new Date(Date.now()+Math.min(3600,Math.max(5,input.ttlSeconds??60))*1000).toISOString(),createdAt:now()};
    this.db.run("INSERT INTO connector_commands(id,environment_id,sequence,type,payload_json,capabilities_json,expires_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",command.id,command.environmentId,command.sequence,command.type,json(command.payload),json(command.capabilities),command.expiresAt,"queued",command.createdAt);return command;
  }
  poll(auth:DeviceAuth){const device=this.authenticate(auth,{});const rows=this.db.all<Row>("SELECT * FROM connector_commands WHERE environment_id=? AND status IN ('queued','delivered') AND expires_at>? ORDER BY sequence LIMIT 20",device.environment_id,now());const commands=rows.map(row=>{const payload={id:row.id,environmentId:row.environment_id,sequence:row.sequence,type:row.type,payload:parseJson(row.payload_json),capabilities:parseJson(row.capabilities_json),expiresAt:row.expires_at};return {...payload,signature:sign(null,Buffer.from(json(payload)),this.privateKey).toString("base64url")};});for(const row of rows)this.db.run("UPDATE connector_commands SET status='delivered',delivered_at=COALESCE(delivered_at,?) WHERE id=?",now(),row.id);return {commands};}
  telemetry(auth:DeviceAuth,input:{events:Array<{id:string;commandId?:string;type:string;payload?:unknown;occurredAt:string}>;health?:unknown;capabilities?:unknown;workload?:number}){const device=this.authenticate(auth,input);let accepted=0,duplicates=0;this.db.transaction(()=>{for(const event of input.events??[]){if(this.db.get("SELECT 1 FROM connector_events WHERE id=?",event.id)){duplicates++;continue;}this.db.run("INSERT INTO connector_events(id,environment_id,command_id,type,payload_json,occurred_at,received_at) VALUES(?,?,?,?,?,?,?)",event.id,device.environment_id,event.commandId??null,event.type,json(event.payload??{}),event.occurredAt,now());if(event.commandId&&["command.completed","command.failed"].includes(event.type))this.db.run("UPDATE connector_commands SET status=? WHERE id=? AND environment_id=?",event.type==="command.completed"?"completed":"failed",event.commandId,device.environment_id);accepted++;}const timestamp=now();this.db.run("UPDATE environment_devices SET last_seen_at=? WHERE id=?",timestamp,device.id);this.db.run("UPDATE environments SET status='online',capabilities_json=COALESCE(?,capabilities_json),health_json=?,updated_at=? WHERE id=?",input.capabilities===undefined?null:json(input.capabilities),json(input.health??{status:"online",workload:input.workload??0,recovery:"connected",checkedAt:timestamp}),timestamp,device.environment_id);this.db.run("UPDATE managers SET status='online',last_heartbeat=? WHERE environment_id=?",timestamp,device.environment_id);});return {accepted,duplicates};}
  revoke(environmentId:string){const timestamp=now();const device=this.db.get<Row>("SELECT * FROM environment_devices WHERE environment_id=?",environmentId);if(!device)throw new Error("Environment connector not found.");this.db.transaction(()=>{this.db.run("UPDATE environment_devices SET status='revoked',revoked_at=? WHERE environment_id=?",timestamp,environmentId);this.db.run("UPDATE environments SET status='revoked',updated_at=? WHERE id=?",timestamp,environmentId);this.db.run("UPDATE managers SET status='offline' WHERE environment_id=?",environmentId);this.db.run("UPDATE connector_commands SET status='cancelled' WHERE environment_id=? AND status IN ('queued','delivered')",environmentId);});return {environmentId,status:"revoked",revokedAt:timestamp};}
  tick(staleAfterMs=30_000){const cutoff=new Date(Date.now()-staleAfterMs).toISOString();const stale=this.db.all<Row>("SELECT * FROM environment_devices WHERE status='active' AND last_seen_at<?",cutoff);for(const device of stale){const timestamp=now();this.db.run("UPDATE environments SET status='offline',health_json=?,updated_at=? WHERE id=?",json({status:"offline",workload:0,recovery:"reconnecting",checkedAt:timestamp}),timestamp,device.environment_id);this.db.run("UPDATE managers SET status='offline' WHERE environment_id=?",device.environment_id);}return stale.length;}
  state(){return {devices:this.db.all("SELECT id,environment_id,status,enrolled_at,revoked_at,last_seen_at FROM environment_devices ORDER BY enrolled_at DESC"),commands:this.db.all("SELECT id,environment_id,sequence,type,capabilities_json,expires_at,status,created_at,delivered_at FROM connector_commands ORDER BY created_at DESC LIMIT 50"),events:this.db.all("SELECT * FROM connector_events ORDER BY received_at DESC LIMIT 50")};}
}
