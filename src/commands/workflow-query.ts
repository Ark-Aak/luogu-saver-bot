import { NapLink } from '@naplink/naplink';
import axios from 'axios';
import { reply } from '@/utils/client';
import { logger } from '@/utils/logger';
import { AllMessageEvent, Command, CommandScope } from '@/types';

export class WorkflowQueryCommand implements Command<AllMessageEvent> {
    name = 'workflow.query';
    description = 'Query the status of a workflow. Usage: workflow.query <workflow_id>';
    usage = '/workflow.query <workflow_id>';
    scope: CommandScope = 'both';

    validateArgs(args: string[]): boolean {
        return args.length === 1;
    }

    async execute(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        const workflowId = args[0];
        const url = `https://api.luogu.me/workflow/query/${workflowId}`;
        const resp = await axios.get(url);
        if (resp.data && resp.data.code === 200) {
            const workflowStatus = resp.data.data.status;
            const createdAt = resp.data.data.createdAt;
            const tasks = resp.data.data.tasks;
            const tasksText =
                tasks?.map((task: any) => `任务 ${task.jobName} (${task.jobId}): ${task.status}`).join('\n') ||
                '无任务信息';
            const msg = `Workflow 状态:\n状态: ${workflowStatus}\n创建时间: ${createdAt}\n任务列表:\n${tasksText}`;
            await reply(client, data, msg);
        } else {
            logger.error('Failed to create workflow', resp.data);
            await reply(client, data, `Workflow 查询失败: ${resp.data.message || 'Unknown error'}`);
        }
    }
}
