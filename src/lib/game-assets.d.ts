declare module 'virtual:whoosh-game-assets' {
  export interface GameAsset {
    url: string;
    size: number;
  }

  export interface GameAssetManifest {
    version: string;
    assets: GameAsset[];
  }

  export const version: string;
  export const assets: GameAsset[];
  const manifest: GameAssetManifest;
  export default manifest;
}
