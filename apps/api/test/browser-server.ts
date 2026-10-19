import { createServer, type AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
export type ViteServer = {
  listen: () => Promise<unknown>;
  close: () => Promise<void>;
};
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
export async function createWebServer(
  apiUrl: string,
  port: number,
): Promise<ViteServer> {
  const root = fileURLToPath(new URL('../../web/', import.meta.url));
  const vitePath = createRequire(import.meta.url).resolve('vite', {
    paths: [root],
  });
  const factory = (await import(pathToFileURL(vitePath).href)) as {
    createServer: (options: unknown) => Promise<ViteServer>;
  };
  const server = await factory.createServer({
    root,
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: { '/api': apiUrl },
    },
    logLevel: 'error',
  });
  await server.listen();
  return server;
}
