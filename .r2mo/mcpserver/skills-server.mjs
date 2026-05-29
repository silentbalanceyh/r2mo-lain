#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import fm from "front-matter";
import os from "os";

const GLOBAL_SKILLS_DIR = process.env.MXT_GLOBAL_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills');
const PROJECT_SKILLS_DIR = process.env.MXT_PROJECT_SKILLS_DIR || path.join(process.cwd(), '.claude', 'skills');

const server = new McpServer({ name: "MXTSkills", version: "2.0.0" });

async function parseSkillFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = fm(content);
    return { attributes: parsed.attributes, body: parsed.body };
  } catch (err) { return null; }
}

async function scanAndRegister(dir, source) {
    if (!fsSync.existsSync(dir)) return;
    try {
        const items = await fs.readdir(dir);
        for (const item of items) {
            const skillDir = path.join(dir, item);
            try {
                if ((await fs.stat(skillDir)).isDirectory()) {
                    const skillFile = path.join(skillDir, 'SKILL.md');
                    if (fsSync.existsSync(skillFile)) {
                         await registerTool(item, skillFile, source);
                    }
                }
            } catch(e){}
        }
    } catch(e) {}
}

async function registerTool(folderName, filePath, source) {
    try {
        const parsed = await parseSkillFile(filePath);
        if(!parsed || !parsed.attributes) return;
        const attr = parsed.attributes;
        const toolName = attr.name || folderName;
        
        const argsSchema = {};
        if (Array.isArray(attr.arguments)) {
             attr.arguments.forEach(arg => {
                 argsSchema[arg.name] = z.string().describe(arg.description || "");
             });
        }

        server.tool(toolName, attr.description || "No desc", argsSchema, async (args) => {
            let res = parsed.body;
            for (const [k, v] of Object.entries(args)) res = res.replace(new RegExp(`{{\${k}}}`, 'g'), v);
            return { content: [{ type: "text", text: res }] };
        });
    } catch(e) { console.error(e); }
}

async function main() {
  await scanAndRegister(PROJECT_SKILLS_DIR, 'project');
  await scanAndRegister(GLOBAL_SKILLS_DIR, 'global');
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch(err => { console.error(err); process.exit(1); });
