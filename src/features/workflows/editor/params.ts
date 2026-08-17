import { parseAsString } from "nuqs/server";

export const editorParams = {
  run: parseAsString.withOptions({ clearOnDefault: true }),
};
