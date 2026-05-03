export type NpmRegistryResponse = {
  name?: string;
  description?: string;
  'dist-tags'?: {
    latest?: string;
  };
  license?: string;
  author?: {
    name?: string;
    email?: string;
    url?: string;
  };
  homepage?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  time?: {
    modified?: string;
  };
  keywords?: string[];
  readme?: string;
};

export type NpmRepoDownloadsResponse = {
  downloads: number;
};

export type NpmSearchPackage = {
  name: string;
  version: string;
  description?: string;
  publisher?: {
    username: string;
  };
  links?: {
    npm?: string;
    repository?: string;
    homepage?: string;
  };
};

export type NpmSearchResponse = {
  objects: { package: NpmSearchPackage }[];
};
