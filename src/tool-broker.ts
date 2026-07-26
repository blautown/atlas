import { statfs } from "node:fs/promises";
import path from "node:path";

export type AtlasToolName = "system.disk_space";
export type AtlasPermission = "system.disk.read";

export interface ToolInvocationContext {
  environmentId: string;
  managerId: string;
  agentId: string;
  permissions: AtlasPermission[];
}

export interface DiskSpaceResult {
  filesystem: string;
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  usedPercent: number;
  measuredAt: string;
}

export interface ToolBroker {
  invoke(name: "system.disk_space", input: { path?: string }, context: ToolInvocationContext): Promise<DiskSpaceResult>;
}

export class LocalToolBroker implements ToolBroker {
  async invoke(name: "system.disk_space", input: { path?: string }, context: ToolInvocationContext): Promise<DiskSpaceResult> {
    if (name !== "system.disk_space") throw new Error(`Unknown ATLAS tool: ${name}`);
    if (!context.permissions.includes("system.disk.read")) throw new Error("Agent lacks system.disk.read permission.");
    const filesystem = path.parse(path.resolve(input.path ?? process.cwd())).root;
    const stats = await statfs(filesystem, { bigint: true });
    const totalBytes = Number(stats.blocks * stats.bsize);
    const availableBytes = Number(stats.bavail * stats.bsize);
    const usedBytes = totalBytes - availableBytes;
    return {
      filesystem, totalBytes, availableBytes, usedBytes,
      usedPercent: totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(2)) : 0,
      measuredAt: new Date().toISOString()
    };
  }
}
