/// <reference types="vite/client" />

declare class EdgeKV {
  constructor(options: { namespace: string });
  get(key: string): Promise<string | undefined>;
  get(key: string, options: { type: 'json' }): Promise<object | undefined>;
  get(key: string, options: { type: 'arrayBuffer' }): Promise<ArrayBuffer | undefined>;
  get(key: string, options: { type: 'stream' }): Promise<ReadableStream | undefined>;
  put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<void>;
  delete(key: string): Promise<boolean>;
}
