export type GitHubWebhookPayload = {
    event: string;
    delivery: string;
    payload: unknown;
};

export type GitHubRepository = {
    fullName: string;
    htmlUrl: string;
};

export type GitHubUser = {
    login: string;
    htmlUrl: string;
};

export type GitHubLabel = {
    name: string;
};

export type GitHubIssueLike = {
    number: number;
    title: string;
    htmlUrl: string;
    state: string;
    user: GitHubUser;
    merged?: boolean;
};

export type GitHubCommit = {
    id: string;
    message: string;
    url: string;
    authorName: string;
};

export type GitHubIssuesPayload = {
    action: string;
    repository: GitHubRepository;
    issue: GitHubIssueLike;
    sender: GitHubUser;
    label?: GitHubLabel;
};

export type GitHubPullRequestPayload = {
    action: string;
    repository: GitHubRepository;
    pullRequest: GitHubIssueLike;
    sender: GitHubUser;
    label?: GitHubLabel;
};

export type GitHubPushPayload = {
    repository: GitHubRepository;
    ref: string;
    compare: string;
    created: boolean;
    deleted: boolean;
    forced: boolean;
    commits: GitHubCommit[];
    sender: GitHubUser;
};

export type GitHubIssueLikeDebounceState = {
    timer: NodeJS.Timeout | null;
    kind: 'issue' | 'pull_request';
    repository: GitHubRepository;
    item: GitHubIssueLike;
    sender: GitHubUser;
    actions: Set<string>;
    addedLabels: Set<string>;
    removedLabels: Set<string>;
};

export type GitHubPushDebounceState = {
    timer: NodeJS.Timeout | null;
    repository: GitHubRepository;
    ref: string;
    compare: string;
    created: boolean;
    deleted: boolean;
    forced: boolean;
    commits: Map<string, GitHubCommit>;
    sender: GitHubUser;
};
