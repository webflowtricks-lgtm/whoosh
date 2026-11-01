import gameAssetManifest from 'virtual:whoosh-game-assets';

export interface AssetDownloadProgress {
  completed: number;
  total: number;
  processedBytes: number;
  totalBytes: number;
}

export interface AssetDownloadResult {
  failures: string[];
}

export const GAME_ASSET_VERSION = gameAssetManifest.version;
export const GAME_ASSETS = gameAssetManifest.assets;

export function cacheGameAssets(
  onProgress: (progress: AssetDownloadProgress) => void,
): Promise<AssetDownloadResult> {
  return new Promise((resolve, reject) => {
    if (!('serviceWorker' in navigator) || typeof MessageChannel === 'undefined') {
      reject(new Error('Este navegador não oferece suporte ao cache necessário para preparar o jogo.'));
      return;
    }

    let timeout: number;
    let channel: MessageChannel | null = null;

    const cleanup = () => {
      window.clearTimeout(timeout);
      channel?.port1.close();
    };

    timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('O download demorou mais do que o esperado. Verifique sua conexão e tente novamente.'));
    }, 15 * 60 * 1000);

    void navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const worker = registration.active || navigator.serviceWorker.controller;
        if (!worker) {
          throw new Error('Não foi possível iniciar o cache offline do jogo.');
        }

        channel = new MessageChannel();
        const messageChannel = channel;
        messageChannel.port1.onmessage = (event: MessageEvent) => {
          const message = event.data;
          if (message?.type === 'progress') {
            onProgress({
              completed: message.completed,
              total: message.total,
              processedBytes: message.processedBytes,
              totalBytes: message.totalBytes,
            });
          } else if (message?.type === 'complete') {
            cleanup();
            resolve({ failures: message.failures });
          } else if (message?.type === 'error') {
            cleanup();
            reject(new Error(message.message || 'Não foi possível preparar os arquivos do jogo.'));
          }
        };
        messageChannel.port1.onmessageerror = () => {
          cleanup();
          reject(new Error('A comunicação com o cache do jogo foi interrompida.'));
        };

        worker.postMessage(
          { type: 'CACHE_GAME_ASSETS', assets: GAME_ASSETS },
          [messageChannel.port2],
        );
      })
      .catch((error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error('Não foi possível iniciar o download dos arquivos.'));
      });
  });
}
