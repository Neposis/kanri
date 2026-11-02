export const PROJECT_EXTENSION = "kanri";

// turns a board title into something every OS accepts as a folder / file name
export const safeFolderName = (name: string) =>
  name.trim().replace(/[<>:"/\\|?*]/g, "_").replace(/[. ]+$/, "") || "Board";

// folder that holds a project file; synchronous so attachment paths never resolve against the wrong folder
export const projectDir = (projectFile: string) =>
  projectFile.replace(/[\\/][^\\/]*$/, "");

const slashes = (p: string) => p.replace(/\\/g, "/");

// path of `path` relative to `dir`, or null when it lies outside of it
export const relativeInside = (dir: string, path: string) => {
  const prefix = `${slashes(dir)}/`;
  const target = slashes(path);
  return target.toLowerCase().startsWith(prefix.toLowerCase())
    ? target.slice(prefix.length)
    : null;
};
