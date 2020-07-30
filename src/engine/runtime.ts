import Target from './target';
import Thread from './thread';
import execute from './execute';
import Sequencer from './sequencer';
import BlocksRuntimeCache from './blocks-runtime-cache';
import Variable from './variable';
// import BlockUtility from './block-utility';
import StringUtil from '../util/string-util';
import uid from '../util/uid';

interface IHatMeta {
    restartExistingThreads: boolean;
    edgeActivated?: boolean;
}

interface IHatsMeta {
    [key: string]: IHatMeta;
}

interface IBlockPackage {
    getPrimitives: () => { [key: string]: Function };
    getHats?: () => IHatsMeta;
}

interface IBlockPackageConstructor {
    new(): IBlockPackage;
}

interface IRuntimeOptions {
    target?: Target;
    blockPackages: { [key: string]: IBlockPackageConstructor };
    getWorkspaceDom: () => Element; // 返回workspace里面的xml dom
    onRunStart: () => void; // 开始运行的回调
    onRunStop: () => void; // 停止运行的回调
    onGlowBlock: (blockId: string, isGlowing: boolean) => void; // 用于高亮某个程序块
    onVisualReport?: (blockId: string, value: string) => void; // Visually report a value associated with a block
}

interface IOpts {
    stackClick?: boolean;
    updateMonitor?: boolean;
    target?: Target;
}

class Runtime {
    profiler = null; // NOTICE: 很重要,不能删除,且必须为null
    target = new Target(this, null);
    threads: Thread[] = [];
    sequencer = new Sequencer(this);
    _primitives: { [key: string]: IBlockPackage } = {};
    _hats: IHatsMeta = {};
    currentStepTime = Runtime.THREAD_STEP_INTERVAL;
    _steppingInterval?: NodeJS.Timeout;
    currentMSecs = Date.now();

    static THREAD_STEP_INTERVAL = 1000 / 60;
    static THREAD_STEP_INTERVAL_COMPATIBILITY = 1000 / 30;

    constructor(private options: IRuntimeOptions) {
        if (options.target) this.target = options.target; // 用户自定义target
        this.registerBlockPackages(options.blockPackages);
        const blocksDOM = options.getWorkspaceDom();
        const variableList = this.target.blocks.createScripts(blocksDOM);
        // 创建变量
        variableList.forEach(e => {
            this.target.createVariable(e.varId, e.varName, e.varType, false);
        });
    }

    /**
     * Register block packages with this runtime.
     */
    registerBlockPackages(blockPackages: { [key: string]: IBlockPackageConstructor }) {
        for (const packageName in blockPackages) {
            if (blockPackages.hasOwnProperty(packageName)) {
                // @todo pass a different runtime depending on package privilege?
                const packageObject = new (blockPackages[packageName])();
                // Collect primitives from package.
                if (packageObject.getPrimitives) {
                    const packagePrimitives = packageObject.getPrimitives();
                    for (const op in packagePrimitives) {
                        if (packagePrimitives.hasOwnProperty(op)) {
                            this._primitives[op] = packagePrimitives[op].bind(packageObject);
                        }
                    }
                }
                // Collect hat metadata from package.
                if (packageObject.getHats) {
                    const packageHats = packageObject.getHats();
                    for (const hatName in packageHats) {
                        if (packageHats.hasOwnProperty(hatName)) {
                            this._hats[hatName] = packageHats[hatName];
                        }
                    }
                }
            }
        }
    }

    getOpcodeFunction(opcode: string) {
        return this._primitives[opcode];
    }

    getIsHat(opcode: string) {
        return this._hats.hasOwnProperty(opcode);
    }

    getIsEdgeActivatedHat(opcode: string) {
        return this._hats.hasOwnProperty(opcode) && this._hats[opcode].edgeActivated;
    }

    /**
     * Create a thread and push it to the list of threads.
     * @param {!string} id ID of block that starts the stack.
     * @param {!Target} target Target to run thread on.
     * @param {?object} opts optional arguments
     * @param {?boolean} opts.stackClick true if the script was activated by clicking on the stack
     * @param {?boolean} opts.updateMonitor true if the script should update a monitor value
     * @return {!Thread} The newly created thread.
     */
    _pushThread(id: string, target: Target, opts: IOpts | null) {
        const thread = new Thread(id);
        thread.target = target;
        thread.stackClick = Boolean(opts && opts.stackClick);
        thread.blockContainer = target.blocks;
        thread.pushStack(id);
        this.threads.push(thread);
        return thread;
    }

    /**
     * Stop a thread: stop running it immediately, and remove it from the thread list later.
     * @param {!Thread} thread Thread object to remove from actives
     */
    _stopThread(thread: Thread) {
        // Mark the thread for later removal
        thread.isKilled = true;
        // Inform sequencer to stop executing that thread.
        this.sequencer.retireThread(thread);
    }

    /**
     * Restart a thread in place, maintaining its position in the list of threads.
     * This is used by `startHats` to and is necessary to ensure 2.0-like execution order.
     * Test project: https://scratch.mit.edu/projects/130183108/
     * @param {!Thread} thread Thread object to restart.
     * @return {Thread} The restarted thread.
     */
    _restartThread(thread: Thread) {
        const newThread = new Thread(thread.topBlock);
        newThread.target = thread.target;
        newThread.stackClick = thread.stackClick;
        newThread.updateMonitor = thread.updateMonitor;
        newThread.blockContainer = thread.blockContainer;
        newThread.pushStack(thread.topBlock);
        const i = this.threads.indexOf(thread);
        if (i > -1) {
            this.threads[i] = newThread;
            return newThread;
        }
        this.threads.push(thread);
        return thread;
    }

    /**
     * Return whether a thread is currently active/running.
     * @param {?Thread} thread Thread object to check.
     * @return {boolean} True if the thread is active/running.
     */
    isActiveThread(thread: Thread) {
        return ((thread.stack.length > 0 && thread.status !== Thread.STATUS_DONE) && this.threads.indexOf(thread) > -1);
    }

    /**
     * Return whether a thread is waiting for more information or done.
     * @param {?Thread} thread Thread object to check.
     * @return {boolean} True if the thread is waiting
     */
    isWaitingThread(thread: Thread) {
        return (thread.status === Thread.STATUS_PROMISE_WAIT || thread.status === Thread.STATUS_YIELD_TICK || !this.isActiveThread(thread));
    }

    /**
     * Toggle a script.
     * @param {!string} topBlockId ID of block that starts the script.
     * @param {?object} opts optional arguments to toggle script
     * @param {?string} opts.target target ID for target to run script on. If not supplied, uses editing target.
     * @param {?boolean} opts.stackClick true if the user activated the stack by clicking, false if not. This
     *     determines whether we show a visual report when turning on the script.
     */
    toggleScript(topBlockId: string, opts: IOpts) {
        opts = Object.assign({
            target: this.target,
            stackClick: false
        }, opts);
        // Remove any existing thread.
        for (let i = 0; i < this.threads.length; i++) {
            // Toggling a script that's already running turns it off
            if (this.threads[i].topBlock === topBlockId && this.threads[i].status !== Thread.STATUS_DONE) {
                const blockContainer = opts.target!.blocks;
                const opcode = blockContainer.getOpcode(blockContainer.getBlock(topBlockId));

                if (this.getIsEdgeActivatedHat(opcode!) && this.threads[i].stackClick !== opts.stackClick) {
                    // Allow edge activated hat thread stack click to coexist with
                    // edge activated hat thread that runs every frame
                    continue;
                }
                this._stopThread(this.threads[i]);
                return;
            }
        }
        // Otherwise add it.
        this._pushThread(topBlockId, opts.target!, opts);
    }

    /**
     * Run a function `f` for all scripts in a workspace.
     * `f` will be called with two parameters:
     *  - the top block ID of the script.
     *  - the target that owns the script.
     * @param {!Function} f Function to call for each script.
     * @param {Target=} optTarget Optionally, a target to restrict to.
     */
    allScriptsDo(f: (blockId: string, target: Target) => void, optTarget?: Target) {
        let targets = [this.target];
        if (optTarget) {
            targets = [optTarget];
        }
        for (let t = targets.length - 1; t >= 0; t--) {
            const target = targets[t];
            const scripts = target.blocks.getScripts();
            for (let j = 0; j < scripts.length; j++) {
                const topBlockId = scripts[j];
                f(topBlockId, target);
            }
        }
    }

    allScriptsByOpcodeDo(opcode: string, f: (script: typeof BlocksRuntimeCache.scriptCacheObj, target: Target) => void, optTarget?: Target) {
        let targets = [this.target];
        if (optTarget) {
            targets = [optTarget];
        }
        for (let t = targets.length - 1; t >= 0; t--) {
            const target = targets[t];
            const scripts = BlocksRuntimeCache.getScripts(target.blocks, opcode);
            for (let j = 0; j < scripts.length; j++) {
                f(scripts[j], target);
            }
        }
    }

    /**
     * Start all relevant hats.
     * @param {!string} requestedHatOpcode Opcode of hats to start.
     * @param {object=} optMatchFields Optionally, fields to match on the hat.
     * @param {Target=} optTarget Optionally, a target to restrict to.
     * @return {Array.<Thread>} List of threads started by this function.
     */
    startHats(requestedHatOpcode: string, optMatchFields?: any, optTarget?: Target) {
        if (!this.isRunning()) {
            return;
        }
        if (!this._hats.hasOwnProperty(requestedHatOpcode)) {
            // No known hat with this opcode.
            return;
        }
        const newThreads: Thread[] = [];
        // Look up metadata for the relevant hat.
        const hatMeta = this._hats[requestedHatOpcode];

        for (const opts in optMatchFields) {
            if (!optMatchFields.hasOwnProperty(opts)) continue;
            optMatchFields[opts] = optMatchFields[opts].toUpperCase();
        }

        // Consider all scripts, looking for hats with opcode `requestedHatOpcode`.
        this.allScriptsByOpcodeDo(requestedHatOpcode, (script, target) => {
            const {
                blockId: topBlockId,
                fieldsOfInputs: hatFields
            } = script;

            // Match any requested fields.
            // For example: ensures that broadcasts match.
            // This needs to happen before the block is evaluated
            // (i.e., before the predicate can be run) because "broadcast and wait"
            // needs to have a precise collection of started threads.
            for (const matchField in optMatchFields) {
                if (hatFields[matchField].value !== optMatchFields[matchField]) {
                    // Field mismatch.
                    return;
                }
            }

            if (hatMeta.restartExistingThreads) {
                // If `restartExistingThreads` is true, we should stop
                // any existing threads starting with the top block.
                for (let i = 0; i < this.threads.length; i++) {
                    if (this.threads[i].target === target &&
                        this.threads[i].topBlock === topBlockId &&
                        // stack click threads and hat threads can coexist
                        !this.threads[i].stackClick) {
                        newThreads.push(this._restartThread(this.threads[i]));
                        return;
                    }
                }
            } else {
                // If `restartExistingThreads` is false, we should
                // give up if any threads with the top block are running.
                for (let j = 0; j < this.threads.length; j++) {
                    if (this.threads[j].target === target &&
                        this.threads[j].topBlock === topBlockId &&
                        // stack click threads and hat threads can coexist
                        !this.threads[j].stackClick &&
                        this.threads[j].status !== Thread.STATUS_DONE) {
                        // Some thread is already running.
                        return;
                    }
                }
            }
            // Start the thread with this top block.
            newThreads.push(this._pushThread(topBlockId, target, null));
        }, optTarget);
        // For compatibility with Scratch 2, edge triggered hats need to be processed before
        // threads are stepped. See ScratchRuntime.as for original implementation
        newThreads.forEach(thread => {
            execute(this.sequencer, thread);
            thread.goToNextBlock();
        });
        return newThreads;
    }

    /**
     * Dispose all targets. Return to clean state.
     */
    dispose() {
        this.stopAll();
        this.target.dispose();
    }

    /**
     * Stop any threads acting on the target.
     * @param {!Target} target Target to stop threads for.
     * @param {Thread=} optThreadException Optional thread to skip.
     */
    stopForTarget(target: Target, optThreadException: Thread) {
        // Stop any threads on the target.
        for (let i = 0; i < this.threads.length; i++) {
            if (this.threads[i] === optThreadException) {
                continue;
            }
            if (this.threads[i].target === target) {
                this._stopThread(this.threads[i]);
            }
        }
    }

    /**
     * Start all threads that start with the green flag.
     */
    greenFlag() {
        this.stopAll();
        this.target.clearEdgeActivatedValues()
        this.target.onGreenFlag();
        this.startHats('event_whenflagclicked');
    }

    /**
     * Stop "everything."
     */
    stopAll() {
        // Dispose of the active thread.
        if (this.sequencer.activeThread !== null) {
            this._stopThread(this.sequencer.activeThread);
        }
        // Remove all remaining threads from executing in the next tick.
        this.threads = [];
    }

    /**
     * Repeatedly run `sequencer.stepThreads` and filter out
     * inactive threads after each iteration.
     */
    _step() {
        // Clean up threads that were told to stop during or since the last step
        this.threads = this.threads.filter(thread => !thread.isKilled);

        // Find all edge-activated hats, and add them to threads to be evaluated.
        for (const hatType in this._hats) {
            if (!this._hats.hasOwnProperty(hatType)) continue;
            const hat = this._hats[hatType];
            if (hat.edgeActivated) {
                this.startHats(hatType);
            }
        }
        this.sequencer.stepThreads();
    }

    /**
     * Emit feedback for block glowing (used in the sequencer).
     * @param {?string} blockId ID for the block to update glow
     * @param {boolean} isGlowing True to turn on glow; false to turn off.
     */
    glowBlock(blockId: string, isGlowing: boolean) {
        this.options.onGlowBlock(blockId, isGlowing);
    }

    /**
     * Emit value for reporter to show in the blocks.
     * @param {string} blockId ID for the block.
     * @param {string} value Value to show associated with the block.
     */
    visualReport(blockId: string, value: string) {
        if (this.options.onVisualReport) {
            this.options.onVisualReport(blockId, value);
        }
    }

    /**
     * Get a target by its id.
     * @param {string} targetId Id of target to find.
     * @return {?Target} The target, if found.
     */
    getTargetById(targetId: string) {
        return this.target;
    }

    /**
     * Get a target representing the Scratch stage, if one exists.
     * @return {?Target} The target, if found.
     */
    getTargetForStage() {
        return this.target;
    }

    /**
     * Get the editing target.
     * @return {?Target} The editing target.
     */
    getEditingTarget() {
        return this.target;
    }

    getAllVarNamesOfType(varType: string) {
        let varNames: string[] = [];
        const targetVarNames = this.target.getAllVariableNamesInScopeByType(varType, true);
        varNames = varNames.concat(targetVarNames);
        return varNames;
    }

    /**
     * Create a new global variable avoiding conflicts with other variable names.
     * @param {string} variableName The desired variable name for the new global variable.
     * This can be turned into a fresh name as necessary.
     * @param {string} optVarId An optional ID to use for the variable. A new one will be generated
     * if a falsey value for this parameter is provided.
     * @param {string} optVarType The type of the variable to create. Defaults to Variable.SCALAR_TYPE.
     * @return {Variable} The new variable that was created.
     */
    createNewGlobalVariable(variableName: string, optVarId?: string, optVarType?: string) {
        const varType = (typeof optVarType === 'string') ? optVarType : Variable.SCALAR_TYPE;
        const allVariableNames = this.getAllVarNamesOfType(varType);
        const newName = StringUtil.unusedName(variableName, allVariableNames);
        const variable = new Variable(optVarId || uid(), newName, varType, false);
        const stage = this.getTargetForStage()!;
        stage.variables[variable.id] = variable;
        return variable;
    }

    /**
     * Set up timers to repeatedly step in a browser.
     */
    start() {
        // Do not start if we are already running
        if (this._steppingInterval) return;

        // 运行所有线程(非帽子块和函数定义)
        // event_whenflagclicked这个帽子块需要运行
        const target = this.target;
        const blockContainer = target.blocks;
        const scripts = blockContainer.getScripts();
        for (let i = 0; i < scripts.length; i++) {
            const topBlockId = scripts[i];
            const opcode = blockContainer.getOpcode(blockContainer.getBlock(topBlockId));
            if ('procedures_definition' == opcode) continue;
            if (this.getIsHat(opcode!) && 'event_whenflagclicked' != opcode) continue;
            this._pushThread(topBlockId, target, null);
        }

        this.options.onRunStart();
        let interval = Runtime.THREAD_STEP_INTERVAL;
        this.currentStepTime = interval;
        this._steppingInterval = setInterval(() => {
            this._step();
            if (this.threads.length == 0) {
                this.stop();
            }
        }, interval);
    }

    stop() {
        if (!this._steppingInterval) return;
        clearInterval(this._steppingInterval!);
        this._steppingInterval = undefined;
        this.options.onRunStop();
    }

    isRunning() {
        return !!this._steppingInterval;
    }

    /**
     * Update a millisecond timestamp value that is saved on the Runtime.
     * This value is helpful in certain instances for compatibility with Scratch 2,
     * which sometimes uses a `currentMSecs` timestamp value in Interpreter.as
     */
    updateCurrentMSecs() {
        this.currentMSecs = Date.now();
    }
}

export default Runtime;
