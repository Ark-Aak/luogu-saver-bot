import { logger } from '@/utils/logger';

export type GitHubWebhookPayload = {
    event: string;
    delivery: string;
    payload: unknown;
};

export async function handleGitHubWebhook(data: GitHubWebhookPayload): Promise<void> {
    logger.info(`Received GitHub webhook: event=${data.event || '-'}, delivery=${data.delivery || '-'}`);
    // TODO: Implement GitHub webhook business logic here.
}
