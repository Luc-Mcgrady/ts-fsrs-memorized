import { defineConfig } from "rollup"
import dts from "rollup-plugin-dts"

// rollup.config.mjs
export default defineConfig([{
    input: 'src/index.ts',
    output: {
        file: 'dist/index.js',
        format: 'cjs'
    }
}, {
    input: 'src/index.ts',
    output: {
        file: 'dist/index.d.ts',
        format: 'cjs'
    },
    plugins: [dts()]
}]);