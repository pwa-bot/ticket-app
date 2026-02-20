export interface SlackAuthTestResponse {
  ok: boolean;
  team_id?: string;
  team?: string;
  user_id?: string;
  error?: string;
}

export interface SlackPostMessageResponse {
  ok: boolean;
  ts?: string;
  error?: string;
}

export interface SlackApiClient {
  authTest(token: string): Promise<SlackAuthTestResponse>;
  postMessage(token: string, channel: string, text: string): Promise<SlackPostMessageResponse>;
}

export function createSlackApiClient(fetchImpl: typeof fetch = fetch): SlackApiClient {
  return {
    async authTest(token: string): Promise<SlackAuthTestResponse> {
      const res = await fetchImpl("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const json = (await res.json()) as SlackAuthTestResponse;
      return json;
    },

    async postMessage(token: string, channel: string, text: string): Promise<SlackPostMessageResponse> {
      const res = await fetchImpl("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          channel,
          text,
          mrkdwn: true,
          unfurl_links: false,
          unfurl_media: false,
        }),
      });

      const json = (await res.json()) as SlackPostMessageResponse;
      return json;
    },
  };
}
