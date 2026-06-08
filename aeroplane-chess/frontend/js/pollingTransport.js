import { playerIdManager } from './playerIdManager.js';

export class PollingTransport {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(options = {}) {
        this.apiBase = options.apiBase || '/api/aeroplane-chess';
        this.playerId = options.playerId || playerIdManager.getPlayerId();
        this.roomCode = options.roomCode || null;
        this.gameSessionId = options.gameSessionId || null;
        this.readyState = PollingTransport.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        this._pollTimer = null;
        this._since = 0;
        this._closed = false;
        this._pollDelay = Number(options.pollDelay || 1000);
    }

    async connect() {
        this.readyState = PollingTransport.OPEN;
        this._closed = false;
        queueMicrotask(() => {
            if (typeof this.onopen === 'function') this.onopen({ type: 'open' });
        });
        this._schedulePoll(50);
        return true;
    }

    send(raw) {
        if (this.readyState !== PollingTransport.OPEN) return;
        let message = {};
        try {
            message = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
        } catch (error) {
            this._emitError(error);
            return;
        }

        const payload = {
            ...message,
            playerId: message.playerId || this.playerId,
            roomCode: message.roomCode || this.roomCode,
            gameSessionId: message.gameSessionId || this.gameSessionId,
            data: {
                ...(message.data || {})
            }
        };

        if (payload.roomCode && !payload.data.roomCode) payload.data.roomCode = payload.roomCode;
        if (payload.gameSessionId && !payload.data.gameSessionId) payload.data.gameSessionId = payload.gameSessionId;

        fetch(`${this.apiBase}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then((res) => res.json())
            .then((data) => {
                if (!data || data.ok === false) {
                    throw new Error(data && data.error ? data.error : 'Polling message failed');
                }
                this._deliverEvents(data.events || []);
            })
            .catch((error) => this._emitError(error));
    }

    close(code = 1000, reason = 'Client disconnect') {
        if (this.readyState === PollingTransport.CLOSED) return;
        this.readyState = PollingTransport.CLOSING;
        this._closed = true;
        if (this._pollTimer) {
            clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
        this.readyState = PollingTransport.CLOSED;
        if (typeof this.onclose === 'function') {
            this.onclose({ type: 'close', code, reason });
        }
    }

    _schedulePoll(delay = this._pollDelay) {
        if (this._closed || this.readyState !== PollingTransport.OPEN) return;
        if (this._pollTimer) clearTimeout(this._pollTimer);
        this._pollTimer = setTimeout(() => this._poll(), delay);
    }

    async _poll() {
        if (this._closed || this.readyState !== PollingTransport.OPEN) return;
        try {
            const url = `${this.apiBase}/events?playerId=${encodeURIComponent(this.playerId)}&since=${encodeURIComponent(this._since)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data || data.ok === false) {
                throw new Error(data && data.error ? data.error : 'Polling failed');
            }
            this._deliverEvents(data.events || []);
            if (Number.isFinite(Number(data.nextSeq))) {
                this._since = Number(data.nextSeq);
            }
        } catch (error) {
            this._emitError(error);
        } finally {
            this._schedulePoll();
        }
    }

    _deliverEvents(events) {
        for (const event of events) {
            if (!event || !event.type) continue;
            if (event.room && event.room.code) this.roomCode = event.room.code;
            if (event.gameSessionId) this.gameSessionId = event.gameSessionId;
            if (typeof this.onmessage === 'function') {
                this.onmessage({ data: JSON.stringify(event) });
            }
        }
    }

    _emitError(error) {
        if (typeof this.onerror === 'function') {
            this.onerror(error);
        }
    }
}

export function getPollingServerUrl() {
    return '/api/aeroplane-chess';
}
