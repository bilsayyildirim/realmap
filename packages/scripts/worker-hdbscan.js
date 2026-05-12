"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hdbscan_ts_1 = require("hdbscan-ts");
const node_worker_threads_1 = require("node:worker_threads");
function build2D(buffer, rows, cols) {
    const f32 = new Float32Array(buffer);
    // shape guard
    if (f32.length !== rows * cols) {
        throw new Error(`buffer length ${f32.length} != rows*cols (${rows}*${cols}=${rows * cols})`);
    }
    // One-time reconstruction (reused for all fits in this worker)
    // Note: USE_ROW_VIEWS defaults to ON for performance
    // Set USE_ROW_VIEWS=0 to disable if hdbscan-ts has issues with Float32Array[]
    const USE_ROW_VIEWS = process.env.USE_ROW_VIEWS !== '0';
    if (USE_ROW_VIEWS) {
        // Return Float32Array views for zero-copy performance
        return Array.from({ length: rows }, (_, i) => f32.subarray(i * cols, (i + 1) * cols));
    }
    else {
        // Return plain arrays for compatibility
        return Array.from({ length: rows }, (_, i) => Array.from(f32.subarray(i * cols, (i + 1) * cols)));
    }
}
function normalizeCombos(combos, mcs, ms, rows) {
    const list = (Array.isArray(combos) && combos.length
        ? combos
        : [{ mcs: Number(mcs), ms: Number(ms) }]);
    const out = [];
    for (const c of list) {
        const MCSraw = Math.floor(Number(c.mcs) || 0);
        const MSraw = Math.floor(Number(c.ms) || 0);
        const MCS = Math.max(2, Math.min(rows ?? Infinity, MCSraw));
        const MS = Math.max(1, MSraw);
        out.push({ mcs: MCS, ms: MS });
    }
    return out;
}
(async () => {
    try {
        if (!node_worker_threads_1.parentPort)
            throw new Error('No parentPort');
        const wd = node_worker_threads_1.workerData;
        // Support both SAB (preferred) and a later transferable buf message
        const run = (buffer) => {
            const Y0 = build2D(buffer, wd.rows, wd.cols);
            const list = normalizeCombos(wd.combos, wd.mcs, wd.ms, wd.rows);
            const results = [];
            for (const { mcs, ms } of list) {
                if (mcs > wd.rows) {
                    results.push({
                        mcs,
                        ms,
                        labels: null,
                        error: 'minClusterSize > rows',
                    });
                    continue;
                }
                try {
                    let labels = new hdbscan_ts_1.HDBSCAN({
                        minClusterSize: mcs,
                        minSamples: ms,
                    }).fit(Y0);
                    results.push({ mcs, ms, labels });
                }
                catch (e) {
                    // Fallback: copy to plain arrays if row-views caused issues
                    try {
                        const Y = Y0.map((r) => Array.isArray(r) ? r : Array.from(r));
                        const labels = new hdbscan_ts_1.HDBSCAN({
                            minClusterSize: mcs,
                            minSamples: ms,
                        }).fit(Y);
                        results.push({ mcs, ms, labels });
                    }
                    catch (e2) {
                        results.push({
                            mcs,
                            ms,
                            labels: null,
                            error: String(e2?.message || e2),
                        });
                    }
                }
            }
            if (node_worker_threads_1.parentPort) {
                node_worker_threads_1.parentPort.postMessage({ results });
            }
        };
        if (wd.sab) {
            // fast path: SAB was provided
            run(wd.sab);
        }
        else {
            // legacy path: wait for a transferable buffer called "buf"
            if (node_worker_threads_1.parentPort) {
                node_worker_threads_1.parentPort.once('message', ({ buf }) => run(buf));
            }
        }
    }
    catch (err) {
        node_worker_threads_1.parentPort?.postMessage({
            error: String(err?.message || err),
            stack: (err?.stack || '').split('\n').slice(0, 3).join('\n'),
        });
    }
})();
