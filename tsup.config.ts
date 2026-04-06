import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/react/index.ts",
    next: "src/next/index.ts",
    "providers/github": "src/providers/github.ts",
    "providers/google": "src/providers/google.ts",
    "providers/microsoft": "src/providers/microsoft.ts",
    "providers/apple": "src/providers/apple.ts",
    "providers/email": "src/providers/email.ts"
  },
  clean: true,
  dts: true,
  format: ["esm"],
  target: "es2022",
  sourcemap: true
});
