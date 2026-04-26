import axios from 'axios';
import { config } from '@/config';
import { QaKnowledgeItem } from '@/utils/qa-knowledge';

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

function buildKnowledgePrompt(items: QaKnowledgeItem[]): string {
    if (items.length === 0) {
        return '当前知识库为空。';
    }

    return items.map(item => `#${item.id} ${item.title}\n${item.content}`).join('\n\n---\n\n');
}

function extractAnswer(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const choices = (data as Record<string, unknown>).choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;

    const first = choices[0];
    if (!first || typeof first !== 'object') return null;
    const message = (first as Record<string, unknown>).message;
    if (!message || typeof message !== 'object') return null;

    const content = (message as Record<string, unknown>).content;
    return typeof content === 'string' && content.trim() ? content.trim() : null;
}

export async function askQaLlm(question: string, knowledgeItems: QaKnowledgeItem[]): Promise<string> {
    if (!config.qa.apiKey) {
        throw new Error('未配置 QA LLM API Key，请检查 qa.apiKey。');
    }

    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: [
                '你是一个群聊问答助手。',
                '请优先依据知识库回答问题。',
                '如果知识库没有相关信息，请明确说明知识库中没有找到答案，并给出谨慎的通用建议。',
                '回答要简洁、准确，适合直接发送到聊天群。',
                '',
                '知识库：',
                buildKnowledgePrompt(knowledgeItems)
            ].join('\n')
        },
        {
            role: 'user',
            content: question
        }
    ];

    const response = await axios.post(
        config.qa.endpoint,
        {
            model: config.qa.model,
            messages,
            temperature: config.qa.temperature,
            max_tokens: config.qa.maxTokens
        },
        {
            headers: {
                Authorization: `Bearer ${config.qa.apiKey}`,
                'Content-Type': 'application/json'
            }
        }
    );

    const answer = extractAnswer(response.data);
    if (!answer) {
        throw new Error('LLM 响应中没有可用回答。');
    }

    return answer;
}
