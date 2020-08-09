import debounce from 'lodash.debounce';
import React, { useRef, useEffect } from 'react';
import { Modal, Row, Space, Button } from 'antd';

import './react-blockly.less';

function CustomProcedures(props: {
    mutator: Element,
    onMutatorChange: (mutator: Element) => void,
}) {
    const containerEl = useRef(null);
    const { mutator, onMutatorChange } = props;
    let declBlock: Blockly.Block;

    useEffect(() => {
        const container = containerEl.current;
        if (!container) return;
        const oldDefaultToolbox = Blockly.Blocks.defaultToolbox;
        Blockly.Blocks.defaultToolbox = null;
        // @ts-ignore
        const oldMainWorkspace = Blockly.mainWorkspace;
        const workspace = Blockly.inject(container, {
            media: 'scratch-blocks/media/',
            zoom: {
                controls: false,
                wheel: false,
                startScale: 1.0
            },
            comments: false,
            collapse: false,
            scrollbars: false,
        });
        // @ts-ignore
        Blockly.mainWorkspace = oldMainWorkspace;
        Blockly.Blocks.defaultToolbox = oldDefaultToolbox;

        declBlock = workspace.newBlock('procedures_declaration');
        declBlock.setMovable(false);
        declBlock.setDeletable(false);
        declBlock.contextMenu = false;
        // @ts-ignore
        declBlock.domToMutation(mutator);
        declBlock.initSvg();
        declBlock.render(false);
        declBlock.moveBy(40, 20);

        const onWorkspaceChange = debounce((): void => {
            // @ts-ignore
            declBlock.onChangeFn(); // NOTICE: 调用这行代码才能得到正确的结果
            // @ts-ignore
            onMutatorChange(declBlock.mutationToDom());
        }, 1000);
        workspace.addChangeListener(onWorkspaceChange);

        return () => {
            workspace.dispose();
        }
    });

    const addLabelArgument = function () {
        // @ts-ignore
        declBlock.addLabelExternal();
    };
    const addBoolArgument = function () {
        // @ts-ignore
        declBlock.addBooleanExternal();
    };
    const addStringNumberArgument = function () {
        // @ts-ignore
        declBlock.addStringNumberExternal();
    };

    return (
        <div className="functionEditor">
            <div className="functionEditorParameters">
                <Space>
                    <div>添加参数:</div>
                    <Button onClick={addLabelArgument}>label</Button>
                    <Button onClick={addStringNumberArgument}>文本</Button>
                    <Button onClick={addBoolArgument}>布尔</Button>
                    <Button onClick={addStringNumberArgument}>数字</Button>
                </Space>
            </div>
            <div className="functionEditorWorkspace" ref={containerEl}></div>
        </div>
    );
}

// @ts-ignore
Blockly.Procedures.externalProcedureDefCallback = function (mutator, callback) {
    // console.log('mutator', mutator);
    let updatedMutator: Element = mutator;
    const onMutatorChange = function (_mutator: Element) {
        updatedMutator = _mutator;
    }

    Modal.confirm({
        maskClosable: false,
        title: '编辑函数',
        icon: null,
        width: 800,
        content: <CustomProcedures mutator={mutator} onMutatorChange={onMutatorChange} />,
        onOk() {
            callback(updatedMutator);
        }
    });
}

interface IProp {
    blocklyDidMount: (workspce: Blockly.Workspace) => void;
}

class ReactBlockly extends React.Component<IProp> {
    _workspace: Blockly.Workspace | null = null;

    componentDidMount(): void {
        const container = document.getElementById('blockly-div')!;
        const workspace = Blockly.inject(container, {
            media: 'scratch-blocks/media/',
            zoom: {
                controls: true,
                wheel: true,
                startScale: 0.675
            },
            grid: {
                spacing: 40,
                length: 2,
                colour: '#ddd'
            },
            comments: true,
            collapse: false
        });
        this._workspace = workspace;
        // this._workspace.addChangeListener(this.onWorkspaceChange);
        this.props.blocklyDidMount(this._workspace);
    }

    componentWillUnmount(): void {
        // this._workspace?.removeChangeListener(this.onWorkspaceChange);
        this._workspace?.dispose();
    }

    render(): React.ReactElement {
        return (
            <div className="blockly-div" id="blockly-div"></div>
        );
    }
}

export default ReactBlockly;
