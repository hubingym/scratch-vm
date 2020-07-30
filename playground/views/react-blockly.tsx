import React from 'react';

import './react-blockly.less';

interface IProp {
  blocklyDidMount: (workspce: Blockly.Workspace) => void;
}

// @ts-ignore
Blockly.Procedures.externalProcedureDefCallback = function(mutator, callback) {
    // console.log('mutator', mutator);
    const funcName = mutator.getAttribute('proccode');
    Blockly.prompt(funcName, '', function(text: string) {
        if (!text) {
            callback(null);
        } else {
            mutator.setAttribute('proccode', text);
            callback(mutator);
        }
    });
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
      <div className="blockly-div" id ="blockly-div"></div>
    );
  }
}

export default ReactBlockly;
