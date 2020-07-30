// @ts-nocheck
const uid = require('../util/uid');

/**
 * Convert and an individual block DOM to the representation tree.
 * Based on Blockly's `domToBlockHeadless_`.
 * @param {Element} blockDOM DOM tree for an individual block.
 * @param {object} blocks Collection of blocks to add to.
 * @param {boolean} isTopBlock Whether blocks at this level are "top blocks."
 * @param {?string} parent Parent block ID.
 * @return {undefined}
 */
const domToBlock = function (blockDOM, blocks, isTopBlock, parent) {
    // Block skeleton.
    const block = {
        id: blockDOM.getAttribute('id') || uid(), // Block ID
        opcode: blockDOM.getAttribute('type'), // For execution, "event_whengreenflag".
        inputs: {}, // Inputs to this block and the blocks they point to.
        fields: {}, // Fields on this block and their values.
        next: null, // Next block in the stack, if one exists.
        topLevel: isTopBlock, // If this block starts a stack.
        parent: parent, // Parent block ID, if available.
        shadow: blockDOM.localName === 'shadow', // If this represents a shadow/slot.
        x: blockDOM.getAttribute('x'), // X position of script, if top-level.
        y: blockDOM.getAttribute('y') // Y position of script, if top-level.
    };

    // Add the block to the representation tree.
    blocks[block.id] = block;

    // Process XML children and find enclosed blocks, fields, etc.
    for (let i = 0; i < blockDOM.children.length; i++) {
        const xmlChild = blockDOM.children[i];
        // Enclosed blocks and shadows
        let childBlockNode = null;
        let childShadowNode = null;
        for (let j = 0; j < xmlChild.children.length; j++) {
            const grandChildNode = xmlChild.children[j];
            if (!grandChildNode.localName) {
                // Non-XML tag node.
                continue;
            }
            const grandChildNodeName = grandChildNode.localName;
            if (grandChildNodeName === 'block') {
                childBlockNode = grandChildNode;
            } else if (grandChildNodeName === 'shadow') {
                childShadowNode = grandChildNode;
            }
        }

        // Use shadow block only if there's no real block node.
        if (!childBlockNode && childShadowNode) {
            childBlockNode = childShadowNode;
        }

        // Not all Blockly-type blocks are handled here,
        // as we won't be using all of them for Scratch.
        switch (xmlChild.localName) {
            case 'field':
                {
                    // Add the field to this block.
                    const fieldName = xmlChild.getAttribute('name');
                    // Add id in case it is a variable field
                    const fieldId = xmlChild.getAttribute('id');
                    let fieldData = '';
                    if (xmlChild.textContent) {
                        fieldData = xmlChild.textContent;
                    }
                    block.fields[fieldName] = {
                        name: fieldName,
                        id: fieldId,
                        value: fieldData
                    };
                    const fieldVarType = xmlChild.getAttribute('variabletype');
                    if (typeof fieldVarType === 'string') {
                        block.fields[fieldName].variableType = fieldVarType;
                    }
                    break;
                }
            case 'comment':
                {
                    block.comment = xmlChild.getAttribute('id');
                    break;
                }
            case 'value':
            case 'statement':
                {
                    // Recursively generate block structure for input block.
                    domToBlock(childBlockNode, blocks, false, block.id);
                    if (childShadowNode && childBlockNode !== childShadowNode) {
                        // Also generate the shadow block.
                        domToBlock(childShadowNode, blocks, false, block.id);
                    }
                    // Link this block's input to the child block.
                    const inputName = xmlChild.getAttribute('name');
                    block.inputs[inputName] = {
                        name: inputName,
                        block: childBlockNode.getAttribute('id'),
                        shadow: childShadowNode ? childShadowNode.getAttribute('id') : null
                    };
                    break;
                }
            case 'next':
                {
                    if (!childBlockNode) {
                        // Invalid child block.
                        continue;
                    }
                    // Recursively generate block structure for next block.
                    domToBlock(childBlockNode, blocks, false, block.id);
                    // Link next block to this block.
                    block.next = childBlockNode.getAttribute('id');
                    break;
                }
            case 'mutation':
                {
                    block.mutation = {};
                    const attrNames = xmlChild.getAttributeNames();
                    attrNames.forEach(name => {
                        block.mutation[name] = xmlChild.getAttribute(name);
                    });
                    break;
                }
        }
    }
};

/**
 * Convert outer blocks DOM from a Blockly CREATE event
 * to a usable form for the Scratch runtime.
 * This structure is based on Blockly xml.js:`domToWorkspace` and `domToBlock`.
 * @param {Element} blocksDOM DOM tree for this event.
 * @return {Array.<object>} Usable list of blocks from this CREATE event.
 */
const domToBlocks = function (blocksDOM) {
    // At this level, there could be multiple blocks adjacent in the DOM tree.
    const blocks = {};
    const variableList = [];
    for (let i = 0; i < blocksDOM.children.length; i++) {
        const block = blocksDOM.children[i];
        if (!block.tagName) {
            continue;
        }
        const tagName = block.tagName.toLowerCase();
        if (tagName === 'block' || tagName === 'shadow') {
            domToBlock(block, blocks, true, null);
        } else if (tagName === 'variables') {
            for (let j = 0; j < block.children.length; j++) {
                const variableDom = block.children[j];
                const variable = {
                    varId: variableDom.getAttribute('id'),
                    varType: variableDom.getAttribute('type'),
                    varName: variableDom.textContent,
                }
                variableList.push(variable);
            }
        }
    }
    // Flatten blocks object into a list.
    const blocksList = [];
    for (const b in blocks) {
        if (!blocks.hasOwnProperty(b)) continue;
        blocksList.push(blocks[b]);
    }
    return [blocksList, variableList];
};

module.exports = domToBlocks;
