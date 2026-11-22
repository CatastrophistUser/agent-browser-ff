import { z } from 'zod';

const common = {
  session: z.string().default('default'),
  timeout: z.number().int().positive().optional(),
  cwd: z.string().optional(),
};
const o = <T extends z.ZodRawShape>(shape: T) => z.object({ ...common, ...shape });
const target = z.string().min(1);

export const methods = {
  'open': o({ url: z.string().optional(), gui: z.boolean().optional(), slowmo: z.number().int().min(0).optional(),
    viewport: z.string().regex(/^\d+x\d+$/).optional(), device: z.string().optional(), persistent: z.boolean().optional() }),
  'gui': o({ on: z.boolean() }),
  'close': o({}),
  'daemon.status': o({}),
  'daemon.stop': o({}),
  'goto': o({ url: z.string() }),
  'back': o({}), 'forward': o({}), 'reload': o({}),
  'follow': o({ target }),
  'wait': o({ kind: z.enum(['load', 'domcontentloaded', 'networkidle', 'selector', 'text', 'url', 'ms']),
    value: z.string().optional(), state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional() }),
  'paginate': o({ next: target, maxPages: z.number().int().positive().optional(), untilMissing: z.boolean().optional() }),
  'tabs': o({ action: z.enum(['list', 'new', 'switch', 'close']), url: z.string().optional(), id: z.number().int().optional() }),
  'click': o({ target, double: z.boolean().optional(), right: z.boolean().optional(), modifiers: z.array(z.string()).optional() }),
  'hover': o({ target }),
  'type': o({ target, text: z.string(), delay: z.number().int().min(0).optional() }),
  'fill': o({ target, text: z.string() }),
  'press': o({ keys: z.string() }),
  'check': o({ target, checked: z.boolean().default(true) }),
  'select': o({ target, values: z.array(z.string()).min(1) }),
  'drag': o({ from: target, to: target }),
  'upload': o({ target, files: z.array(z.string()).min(1) }),
  'scroll': o({ target, to: z.enum(['top', 'bottom']).optional(), by: z.number().optional() }),
  'form.fill': o({ target, data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])) }),
  'snapshot': o({ full: z.boolean().optional(), selector: z.string().optional() }),
  'text': o({ target, all: z.boolean().optional() }),
  'attr': o({ target, name: z.string(), all: z.boolean().optional() }),
  'html': o({ target, outer: z.boolean().optional() }),
  'eval': o({ expression: z.string(), arg: z.unknown().optional() }),
  'screenshot': o({ target: z.string().optional(), fullPage: z.boolean().optional(), out: z.string().optional(), withOverlay: z.boolean().optional() }),
  'pdf': o({ out: z.string() }),
  'console': o({ level: z.string().optional(), since: z.number().int().min(0).optional() }),
  'network': o({ filter: z.string().optional(), har: z.string().optional() }),
  'assert': o({ target, kind: z.enum(['visible', 'hidden', 'text', 'value', 'count']), expected: z.string().optional() }),
  'scrape': o({ schema: z.unknown(), paginateNext: z.string().optional(), maxPages: z.number().int().positive().optional(),
    out: z.string().optional(), format: z.enum(['json', 'jsonl', 'csv']).default('json') }),
  'vault.fill': o({ target, key: z.string().min(1), passphrase: z.string().optional() }),
  'login': o({ key: z.string().min(1), macro: z.string().min(1), passphrase: z.string().optional() }),
  'crawl': o({ url: z.string(), match: z.string(), schema: z.unknown(), maxPages: z.number().int().positive().optional(), concurrency: z.number().int().positive().optional(),
    delay: z.number().int().min(0).optional(), ignoreRobots: z.boolean().optional(), out: z.string().optional(), format: z.enum(['json', 'jsonl', 'csv']).default('json') }),
  'video': o({ action: z.enum(['start', 'stop']), out: z.string().optional() }),
  'macro.record': o({ name: z.string().min(1).regex(/^[\w.-]+$/) }),
  'macro.stop': o({}),
  'state.save': o({ file: z.string() }),
  'state.load': o({ file: z.string() }),
  'session.new': o({ name: z.string().min(1), persistent: z.boolean().optional() }),
  'session.list': o({}),
  'session.close': o({ name: z.string().min(1) }),
  'macro.fromHistory': o({ name: z.string().min(1), last: z.number().int().positive().optional() }),
  'macro.list': o({}),
  'macro.show': o({ name: z.string() }),
  'macro.delete': o({ name: z.string() }),
  'macro.begin': o({ name: z.string(), vars: z.record(z.string(), z.string()).default({}) }),
  'macro.step': o({ index: z.number().int().min(0) }),
} satisfies Record<string, z.ZodType>;

export type MethodName = keyof typeof methods;
export type Params<M extends MethodName> = z.input<(typeof methods)[M]>;

export const requestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type RpcRequest = z.infer<typeof requestSchema>;
export interface RpcResponse {
  jsonrpc: '2.0'; id: string | number | null;
  result?: { message: string; [k: string]: unknown };
  error?: { code: number; message: string; data?: { code: string; hint?: string } };
}
