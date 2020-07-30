import React, { useState } from 'react';
import { Row, Col, Space } from 'antd';
import { Button } from 'antd';
import Runtime from '../../src/engine/runtime';
import defaultBlockPackages from '../../src/blocks/packages';

import './operation.less';

interface IProp {
    workspace: Blockly.Workspace;
}

let _runtime: Runtime | null = null;

document.addEventListener("keydown", event => {
    if (_runtime?.isRunning()) {
        console.log('event.key: ', event.key);
        _runtime?.startHats('event_whenkeypressed', { KEY_OPTION: event.key });
    }
});

function Operation({ workspace }: IProp) {
    const [running, setRunning] = useState(false);
    const [xml, setXml] = useState<string>('');
    const showXml = () => {
        const dom = Blockly.Xml.workspaceToDom(workspace);
        const _xml = Blockly.Xml.domToText(dom);
        setXml(_xml);
    }
    const onClickRun = () => {
        if (_runtime) return; // 还在运行
        _runtime = new Runtime({
            blockPackages: defaultBlockPackages,
            getWorkspaceDom: () => {
                const dom = Blockly.Xml.workspaceToDom(workspace);
                // console.log('dom: ', dom);
                return dom;
            },
            onRunStart: () => {
                setRunning(true);
            },
            onRunStop: () => {
                // workspace.highlightBlock(''); // 取消所有的高亮
                workspace.glowBlock('');
                setRunning(false);
                _runtime = null;
            },
            onGlowBlock: (blockId, isGlowing) => {
                // workspace.highlightBlock(blockId, isGlowing);
                workspace.glowBlock(blockId, isGlowing);
            },
        });
        _runtime.start(); // 开始运行
    }
    const onClickStop = () => {
        _runtime?.stop();
    }
    return (
        <div className="operation">
            <Row>
                <Space>
                    <Button onClick={showXml}>显示xml</Button>
                    {!running && <Button onClick={onClickRun}>运行</Button>}
                    {running && <Button onClick={onClickStop}>停止</Button>}
                </Space>
            </Row>
            <Row>
                <Col span="24">
                    <p>{xml}</p>
                </Col>
            </Row>
        </div>
    );
}

export default Operation;
