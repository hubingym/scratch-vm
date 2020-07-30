import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import json from '@rollup/plugin-json';
import { terser } from "rollup-plugin-terser";

const configEngine = {
    input: 'src/engine/runtime.ts',
    output: {
        file: 'dist/scratch-runtime.js',
        name: 'ScratchRuntime',
        format: 'umd',
        strict: false,
    },
    plugins: [
        resolve(),
        commonjs(),
        json(),
        typescript(),
    ],
    external: [
    ]
};

const configEngineMin = Object.assign({}, configEngine);
configEngineMin.output = Object.assign({}, configEngine.output, {
    file: 'dist/scratch-runtime.min.js',
});
configEngineMin.plugins = configEngineMin.plugins.concat(terser());

const configBlockPackages = {
    input: 'src/blocks/packages.ts',
    output: {
        file: 'dist/scratch-packages.js',
        name: 'ScratchBlockPackages',
        format: 'umd',
        strict: false,
    },
    plugins: [
        resolve(),
        commonjs(),
        json(),
        typescript(),
    ],
    external: [
    ]
};

const configArr = [
    configEngine,
    configEngineMin,
    configBlockPackages,
];

export default configArr;
