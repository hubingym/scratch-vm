import React, { useState } from 'react';
import ReactBlockly from './react-blockly';
import Operation from './operation';

import './app.less';

function App() {
    const [workspce, setWorkspce] = useState<Blockly.Workspace | null>(null);
    function blocklyDidMount(_workspce: Blockly.Workspace) {
        setWorkspce(_workspce);
    }
    return (
        <div className="app">
            <div className="content-left">
                <ReactBlockly blocklyDidMount={blocklyDidMount} />
            </div>
            <div className="content-right">
                {!!workspce && <Operation workspace={workspce} />}
            </div>
        </div>
    );
}

export default App;
