import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { Command, CommandScope, AllMessageEvent } from '@/types';
import { reply } from '@/utils/client';
import { isSuperUser } from '@/utils/permission';
import { isValidPositiveId } from '@/utils/validator';
import {
    addQaKnowledgeItem,
    deleteQaKnowledgeItem, getQaKnowledgeItemById,
    getQaKnowledgeItems,
    updateQaKnowledgeItem
} from '@/utils/qa-knowledge';
import { askQaLlm } from '@/utils/qa-llm';
import { config } from '@/config';
import { getErrorMessage } from '@/utils/error';

export class QaCommand implements Command<AllMessageEvent> {
    name = 'qa';
    description = '动态知识库问答。';
    usage = {
        ask: '/qa <问题> 或 /qa ask <问题>',
        add: '/qa add <标题> | <内容>（超级管理员）',
        edit: '/qa edit <知识 ID> <标题> | <内容>（超级管理员）',
        list: '/qa list',
        delete: '/qa delete <知识 ID>（超级管理员）'
    };
    scope: CommandScope = 'both';

    validateArgs(args: string[]): boolean {
        if (args.length === 0) return false;
        if (args[0] === 'list') return args.length === 1;
        if (args[0] === 'delete') return args.length === 2 && isValidPositiveId(args[1]);
        if (args[0] === 'add') return args.length >= 2 && args.slice(1).join(' ').includes('|');
        if (args[0] === 'edit')
            return args.length >= 3 && isValidPositiveId(args[1]) && args.slice(2).join(' ').includes('|');
        if (args[0] === 'ask') return args.length >= 2;
        if (args[0] === 'query') return args.length === 2;
        return true;
    }

    async execute(
        args: string[],
        client: NapLink,
        data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent
    ): Promise<void> {
        if (args[0] === 'add') {
            await this.handleAdd(args.slice(1).join(' '), client, data);
            return;
        }

        if (args[0] === 'list') {
            await this.handleList(client, data);
            return;
        }

        if (args[0] === 'edit') {
            await this.handleEdit(Number(args[1]), args.slice(2).join(' '), client, data);
            return;
        }

        if (args[0] === 'delete') {
            await this.handleDelete(Number(args[1]), client, data);
            return;
        }

        if (args[0] === 'query') {
            await this.handleQuery(Number(args[1]), client, data);
            return;
        }

        const question = args[0] === 'ask' ? args.slice(1).join(' ') : args.join(' ');
        await this.handleAsk(question, client, data);
    }

    private async requireSuperUser(client: NapLink, data: AllMessageEvent): Promise<boolean> {
        if (isSuperUser(data.user_id)) return true;
        await reply(client, data, '权限不足，需要超级管理员权限。');
        return false;
    }

    private async handleQuery(id: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        const item = await getQaKnowledgeItemById(id);
        if (!item) {
            await reply(client, data, `未找到知识 #${id}。`);
            return;
        }

        await reply(client, data, `知识 ${id}（${item.title}）：\n\n${item.content}`);
    }

    private async handleAdd(raw: string, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        const separatorIndex = raw.indexOf('|');
        const title = raw.slice(0, separatorIndex).trim();
        const content = raw.slice(separatorIndex + 1).trim();
        if (!title || !content) {
            await reply(client, data, '标题和内容不能为空，用法：/qa add <标题> | <内容>');
            return;
        }

        try {
            const id = await addQaKnowledgeItem(title, content, data.user_id);
            await reply(client, data, `已添加知识 #${id}: ${title}`);
        } catch (error) {
            await reply(client, data, `添加失败：${getErrorMessage(error)}`);
        }
    }

    private async handleEdit(id: number, raw: string, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        const separatorIndex = raw.indexOf('|');
        const title = raw.slice(0, separatorIndex).trim();
        const content = raw.slice(separatorIndex + 1).trim();
        if (!title || !content) {
            await reply(client, data, '标题和内容不能为空，用法：/qa edit <知识 ID> <标题> | <内容>');
            return;
        }

        try {
            const updated = await updateQaKnowledgeItem(id, title, content);
            await reply(client, data, updated ? `已更新知识 #${id}: ${title}` : `未找到知识 #${id}。`);
        } catch (error) {
            await reply(client, data, `编辑失败：${getErrorMessage(error)}`);
        }
    }

    private async handleList(client: NapLink, data: AllMessageEvent): Promise<void> {
        const items = await getQaKnowledgeItems();
        if (items.length === 0) {
            await reply(client, data, '知识库为空。');
            return;
        }

        await reply(client, data, ['QA 知识库', ...items.map(item => `#${item.id} ${item.title}`)].join('\n'));
    }

    private async handleDelete(id: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;

        try {
            const deleted = await deleteQaKnowledgeItem(id);
            await reply(client, data, deleted ? `已删除知识 #${id}。` : `未找到知识 #${id}。`);
        } catch (error) {
            await reply(client, data, `删除失败：${getErrorMessage(error)}`);
        }
    }

    private async handleAsk(question: string, client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const knowledgeItems = await getQaKnowledgeItems(config.qa.maxKnowledgeItems);
            const answer = await askQaLlm(question, knowledgeItems);
            await reply(client, data, answer);
        } catch (error) {
            await reply(client, data, `问答失败：${getErrorMessage(error)}`);
        }
    }
}
