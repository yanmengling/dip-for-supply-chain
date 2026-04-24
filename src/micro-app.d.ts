export interface GetAccessToken {
    (): string;
}

export interface RefreshToken {
    (): Promise<{ accessToken: string }>;
}

export interface TokenExpiredHandler {
    (code?: number): void;
}

export interface Route {
    basename: string;
}

export interface User {
    id: string;
    get vision_name(): string;
    get account(): string;
}

export interface RenderAppMenu {
    (container: HTMLElement | string): void;
}

export interface Logout {
    (): void;
}

export interface SetMicroAppState {
    (state: Record<string, any>): boolean;
}

export interface MicroAppStateChangeHandler {
    (
        callback: (state: any, prev: any) => void,
        fireImmediately?: boolean
    ): () => void;
}

export interface MicroAppProps {
    token: {
        accessToken: GetAccessToken;
        refreshToken: RefreshToken;
        onTokenExpired: TokenExpiredHandler;
    };
    route: Route;
    User: User;
    renderAppMenu: RenderAppMenu;
    logout: Logout;
    setGlobalState: SetMicroAppState;
    onGlobalStateChange: MicroAppStateChangeHandler;
    container?: HTMLElement;
    name?: string;
    [key: string]: any;
}
