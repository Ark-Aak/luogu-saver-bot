import { NapLink } from '@naplink/naplink';
import { config } from '@/config';
import { sendGroupMessage, sendPrivateMessage } from '@/utils/client';
import { logger } from '@/utils/logger';
import {
    GitHubCommit,
    GitHubIssueLike,
    GitHubIssueLikeDebounceState,
    GitHubIssuesPayload,
    GitHubLabel,
    GitHubPullRequestPayload,
    GitHubPushDebounceState,
    GitHubPushPayload,
    GitHubRepository,
    GitHubUser,
    GitHubWebhookPayload
} from '@/types/github';

const issueLikeDebounceStates = new Map<string, GitHubIssueLikeDebounceState>();
const pushDebounceStates = new Map<string, GitHubPushDebounceState>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

function getString(record: Record<string, unknown>, key: string, fallback = ''): string {
    const value = record[key];
    return typeof value === 'string' ? value : fallback;
}

function getNumber(record: Record<string, unknown>, key: string, fallback = 0): number {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getBoolean(record: Record<string, unknown>, key: string): boolean {
    return record[key] === true;
}

function parseRepository(value: unknown): GitHubRepository | null {
    if (!isRecord(value)) return null;
    const fullName = getString(value, 'full_name');
    const htmlUrl = getString(value, 'html_url');
    return fullName && htmlUrl ? { fullName, htmlUrl } : null;
}

function parseUser(value: unknown): GitHubUser | null {
    if (!isRecord(value)) return null;
    const login = getString(value, 'login');
    const htmlUrl = getString(value, 'html_url');
    return login ? { login, htmlUrl } : null;
}

function parseLabel(value: unknown): GitHubLabel | undefined {
    if (!isRecord(value)) return undefined;
    const name = getString(value, 'name');
    return name ? { name } : undefined;
}

function parseIssueLike(value: unknown, isPullRequest: boolean): GitHubIssueLike | null {
    if (!isRecord(value)) return null;
    const user = parseUser(value.user);
    const number = getNumber(value, 'number');
    const title = getString(value, 'title');
    const htmlUrl = getString(value, 'html_url');
    if (!user || number <= 0 || !title || !htmlUrl) return null;
    return {
        number,
        title,
        htmlUrl,
        state: getString(value, 'state'),
        user,
        merged: isPullRequest ? getBoolean(value, 'merged') : undefined
    };
}

function parseCommit(value: unknown): GitHubCommit | null {
    if (!isRecord(value)) return null;
    const id = getString(value, 'id');
    const message = getString(value, 'message');
    const url = getString(value, 'url');
    const author = isRecord(value.author) ? value.author : {};
    if (!id || !message || !url) return null;
    return {
        id,
        message,
        url,
        authorName: getString(author, 'name') || getString(author, 'username') || '-'
    };
}

function parseIssuesPayload(payload: unknown): GitHubIssuesPayload | null {
    if (!isRecord(payload)) return null;
    const repository = parseRepository(payload.repository);
    const issue = parseIssueLike(payload.issue, false);
    const sender = parseUser(payload.sender);
    const action = getString(payload, 'action');
    if (!repository || !issue || !sender || !action) return null;
    return { action, repository, issue, sender, label: parseLabel(payload.label) };
}

function parsePullRequestPayload(payload: unknown): GitHubPullRequestPayload | null {
    if (!isRecord(payload)) return null;
    const repository = parseRepository(payload.repository);
    const pullRequest = parseIssueLike(payload.pull_request, true);
    const sender = parseUser(payload.sender);
    const action = getString(payload, 'action');
    if (!repository || !pullRequest || !sender || !action) return null;
    return { action, repository, pullRequest, sender, label: parseLabel(payload.label) };
}

function parsePushPayload(payload: unknown): GitHubPushPayload | null {
    if (!isRecord(payload)) return null;
    const repository = parseRepository(payload.repository);
    const sender = parseUser(payload.sender);
    if (!repository || !sender) return null;
    const commits = Array.isArray(payload.commits)
        ? payload.commits.map(parseCommit).filter((commit): commit is GitHubCommit => commit !== null)
        : [];
    return {
        repository,
        ref: getString(payload, 'ref'),
        compare: getString(payload, 'compare'),
        created: getBoolean(payload, 'created'),
        deleted: getBoolean(payload, 'deleted'),
        forced: getBoolean(payload, 'forced'),
        commits,
        sender
    };
}

function formatAction(action: string, kind: 'issue' | 'pull_request'): string {
    const common: Record<string, string> = {
        opened: '打开',
        edited: '编辑',
        deleted: '删除',
        closed: '关闭',
        reopened: '重新打开',
        assigned: '指派',
        unassigned: '取消指派',
        locked: '锁定',
        unlocked: '解锁',
        pinned: '置顶',
        unpinned: '取消置顶',
        transferred: '转移',
        milestoned: '设置里程碑',
        demilestoned: '移除里程碑'
    };
    const pullRequest: Record<string, string> = {
        synchronize: '同步提交',
        ready_for_review: '标记为可审阅',
        converted_to_draft: '转为草稿',
        review_requested: '请求审阅',
        review_request_removed: '移除审阅请求',
        auto_merge_enabled: '启用自动合并',
        auto_merge_disabled: '禁用自动合并'
    };
    return (kind === 'pull_request' ? pullRequest[action] : undefined) ?? common[action] ?? action;
}

function getBranchName(ref: string): string {
    return ref.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, 'tag:');
}

function getFirstLine(value: string): string {
    return value.split('\n')[0].trim();
}

function getIssueLikeKey(kind: 'issue' | 'pull_request', repository: GitHubRepository, item: GitHubIssueLike): string {
    return `${kind}:${repository.fullName}:${item.number}`;
}

function getPushKey(payload: GitHubPushPayload): string {
    return `push:${payload.repository.fullName}:${payload.ref}`;
}

async function sendNotification(client: NapLink, message: string): Promise<void> {
    const groupIds = config.webhook.notifyGroups;
    const userIds = config.webhook.notifyUsers;
    if (groupIds.length === 0 && userIds.length === 0) {
        logger.warn('GitHub webhook notification skipped: no webhook.notifyGroups or webhook.notifyUsers configured.');
        return;
    }

    const tasks = [
        ...groupIds.map(groupId => sendGroupMessage(client, groupId, message, true)),
        ...userIds.map(userId => sendPrivateMessage(client, userId, message, true))
    ];
    const results = await Promise.allSettled(tasks);
    for (const result of results) {
        if (result.status === 'rejected') {
            logger.error('Failed to send GitHub webhook notification:', result.reason);
        }
    }
}

function scheduleFlush(callback: () => void, currentTimer: NodeJS.Timeout | null): NodeJS.Timeout | null {
    if (currentTimer) clearTimeout(currentTimer);
    if (config.webhook.debounceMs === 0) {
        callback();
        return null;
    }
    return setTimeout(callback, config.webhook.debounceMs);
}

function recordIssueLikeAction(state: GitHubIssueLikeDebounceState, action: string, label?: GitHubLabel): void {
    if (action === 'labeled' && label) {
        state.addedLabels.add(label.name);
        return;
    }
    if (action === 'unlabeled' && label) {
        state.removedLabels.add(label.name);
        return;
    }
    state.actions.add(action);
}

function formatIssueLikeMessage(state: GitHubIssueLikeDebounceState): string {
    const title = state.kind === 'issue' ? 'GitHub Issue 更新' : 'GitHub Pull Request 更新';
    const itemLabel = state.kind === 'issue' ? 'Issue' : 'PR';
    const actions = [...state.actions].map(action => formatAction(action, state.kind));
    if (state.addedLabels.size > 0) actions.push(`添加标签：${[...state.addedLabels].join(', ')}`);
    if (state.removedLabels.size > 0) actions.push(`移除标签：${[...state.removedLabels].join(', ')}`);

    return [
        title,
        `仓库: ${state.repository.fullName}`,
        `${itemLabel}: #${state.item.number} ${state.item.title}`,
        `动作: ${actions.length ? actions.join('；') : '更新'}`,
        `状态: ${state.item.merged ? 'merged' : state.item.state || '-'}`,
        `操作者: ${state.sender.login}`,
        `链接: ${state.item.htmlUrl}`
    ].join('\n');
}

function formatPushMessage(state: GitHubPushDebounceState): string {
    const commits = [...state.commits.values()];
    const shownCommits = commits.slice(0, config.webhook.maxPushCommits);
    const restCount = commits.length - shownCommits.length;
    const action = state.deleted ? '删除分支' : state.created ? '创建分支' : state.forced ? '强制推送' : '推送';

    return [
        'GitHub Push 更新',
        `仓库: ${state.repository.fullName}`,
        `分支: ${getBranchName(state.ref) || '-'}`,
        `动作: ${action}`,
        `提交数: ${commits.length}`,
        `操作者: ${state.sender.login}`,
        ...shownCommits.map(
            commit => `- ${commit.id.slice(0, 7)} ${getFirstLine(commit.message)} (${commit.authorName})`
        ),
        restCount > 0 ? `还有 ${restCount} 个提交未显示。` : null,
        state.compare ? `对比: ${state.compare}` : null
    ]
        .filter((line): line is string => line !== null)
        .join('\n');
}

function enqueueIssueLikeNotification(
    client: NapLink,
    kind: 'issue' | 'pull_request',
    repository: GitHubRepository,
    item: GitHubIssueLike,
    action: string,
    sender: GitHubUser,
    label?: GitHubLabel
): void {
    const key = getIssueLikeKey(kind, repository, item);
    const state = issueLikeDebounceStates.get(key) ?? {
        timer: null,
        kind,
        repository,
        item,
        sender,
        actions: new Set<string>(),
        addedLabels: new Set<string>(),
        removedLabels: new Set<string>()
    };

    state.repository = repository;
    state.item = item;
    state.sender = sender;
    recordIssueLikeAction(state, action, label);
    state.timer = scheduleFlush(() => {
        issueLikeDebounceStates.delete(key);
        void sendNotification(client, formatIssueLikeMessage(state));
    }, state.timer);
    issueLikeDebounceStates.set(key, state);
}

function enqueuePushNotification(client: NapLink, payload: GitHubPushPayload): void {
    const key = getPushKey(payload);
    const state = pushDebounceStates.get(key) ?? {
        timer: null,
        repository: payload.repository,
        ref: payload.ref,
        compare: payload.compare,
        created: payload.created,
        deleted: payload.deleted,
        forced: payload.forced,
        commits: new Map<string, GitHubCommit>(),
        sender: payload.sender
    };

    state.repository = payload.repository;
    state.ref = payload.ref;
    state.compare = payload.compare || state.compare;
    state.created = state.created || payload.created;
    state.deleted = state.deleted || payload.deleted;
    state.forced = state.forced || payload.forced;
    state.sender = payload.sender;
    for (const commit of payload.commits) {
        state.commits.set(commit.id, commit);
    }
    state.timer = scheduleFlush(() => {
        pushDebounceStates.delete(key);
        void sendNotification(client, formatPushMessage(state));
    }, state.timer);
    pushDebounceStates.set(key, state);
}

export async function handleGitHubWebhook(client: NapLink, data: GitHubWebhookPayload): Promise<void> {
    logger.info(`Received GitHub webhook: event=${data.event || '-'}, delivery=${data.delivery || '-'}`);

    if (data.event === 'issues') {
        const payload = parseIssuesPayload(data.payload);
        if (!payload) {
            logger.warn('Invalid GitHub issues webhook payload.');
            return;
        }
        enqueueIssueLikeNotification(
            client,
            'issue',
            payload.repository,
            payload.issue,
            payload.action,
            payload.sender,
            payload.label
        );
        return;
    }

    if (data.event === 'pull_request') {
        const payload = parsePullRequestPayload(data.payload);
        if (!payload) {
            logger.warn('Invalid GitHub pull_request webhook payload.');
            return;
        }
        enqueueIssueLikeNotification(
            client,
            'pull_request',
            payload.repository,
            payload.pullRequest,
            payload.action,
            payload.sender,
            payload.label
        );
        return;
    }

    if (data.event === 'push') {
        const payload = parsePushPayload(data.payload);
        if (!payload) {
            logger.warn('Invalid GitHub push webhook payload.');
            return;
        }
        enqueuePushNotification(client, payload);
        return;
    }

    logger.info(`Ignored GitHub webhook event: ${data.event || '-'}`);
}
