import { AllMessageEvent, Command, CommandScope } from '@/commands/index';
import { NapLink } from '@naplink/naplink';
import axios from 'axios';
import { config } from '@/config';
import { getTargetId, sendAutoMessage } from '@/utils/client';
import { MessageBuilder } from '@/utils/message-builder';
import { logger } from '@/utils/logger';

export class WorkflowCreateCommand implements Command<AllMessageEvent> {
    name = 'workflow.create';
    description = 'Execute a predefined workflow. Usage: workflow <workflow_name> <params>';
    usage = '/workflow.create <workflow_name> [key@value ...]';
    scope: CommandScope = 'both';
    superUserOnly = true;

    validateArgs(args: string[]): boolean {
        if (args.length < 1) return false;
        for (let i = 1; i < args.length; i++) {
            if (!args[i].includes('@')) {
                return false;
            }
        }
        return true;
    }

    async execute(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        const isPrivate = data.message_type === 'private';
        const workflowName = args[0];
        const params = args.slice(1);
        const url = `https://api.luogu.me/workflow/create/template/${workflowName}`;
        const body: any = {};
        for (let i = 0; i < params.length; i++) {
            const parts = params[i].split('@');
            const key = parts[0];
            body[key] = parts.slice(1).join('@');
        }
        logger.info(`Requesting URL ${url}`);
        logger.info(`User ${data.user_id} is trying to start workflow ${workflowName}`, { body });
        const resp = await axios.post(url, body, {
            headers: { Authorization: `Bearer ${config.saver.token}` }
        });
        if (resp.data && resp.data.code === 200) {
            const workflowId = resp.data.data.workflowId;
            const tasks = resp.data.data.jobIds;
            const msgObject = new MessageBuilder()
                .reply(data.message_id)
                .atIf(!isPrivate, data.user_id)
                .text(
                    `Workflow 已启动。\nWorkflow ID: ${workflowId}\n任务列表:\n${Object.keys(tasks)
                        .map(key => `${key}: ${tasks[key]}`)
                        .join('\n')}`
                )
                .build();
            await sendAutoMessage(client, isPrivate, getTargetId(data), msgObject);
        } else {
            logger.error('Failed to create workflow', resp.data);
            const msgObject = new MessageBuilder()
                .reply(data.message_id)
                .atIf(!isPrivate, data.user_id)
                .text(`Workflow 启动失败: ${resp.data.message || 'Unknown error'}`)
                .build();
            await sendAutoMessage(client, isPrivate, getTargetId(data), msgObject);
        }
    }
}
