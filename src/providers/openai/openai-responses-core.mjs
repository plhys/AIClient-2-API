import { v4 as uuidv4 } from 'uuid';

// 精简 stub: 函数签名保留以维持编译兼容
let responseIdxCounter = 0;
let itemIdxCounter = 0;
let contentIdxCounter = 0;

export function resetStreamIndices() {
    responseIdxCounter = 0;
    itemIdxCounter = 0;
    contentIdxCounter = 0;
}

export function generateResponseCreated(responseId, model) {
    const id = responseId || 'resp_' + uuidv4();
    return {
        type: 'response.created',
        response: { id, object: 'response', model, status: 'in_progress' }
    };
}

export function generateResponseInProgress(responseId) {
    return { type: 'response.in_progress', response: { id: responseId } };
}

export function generateOutputItemAdded(responseId) {
    const idx = itemIdxCounter++;
    return {
        type: 'response.output_item.added',
        output_index: idx,
        item: { id: 'item_' + uuidv4(), type: 'message', role: 'assistant', content: [] }
    };
}

export function generateContentPartAdded(responseId) {
    const idx = contentIdxCounter++;
    return {
        type: 'response.content_part.added',
        content_index: idx,
        part: { type: 'output_text', text: '' }
    };
}

export function generateOutputTextDone(responseId) {
    return { type: 'response.output_text.done' };
}

export function generateContentPartDone(responseId) {
    return { type: 'response.content_part.done' };
}

export function generateOutputItemDone(responseId) {
    return { type: 'response.output_item.done' };
}

export function generateResponseCompleted(responseId) {
    return {
        type: 'response.completed',
        response: { id: responseId, status: 'completed' }
    };
}
