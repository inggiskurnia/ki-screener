import type { Logger } from "./logger.js";
import { errorMessage } from "./logger.js";
import { withRetry } from "./retry.js";
import type { Disclosure, NotificationSender } from "./types.js";

export function escapeTelegramHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function safeLink(url: string): string {
  return escapeTelegramHtml(encodeURI(url));
}

export function formatDisclosureMessage(disclosure: Disclosure, keyword: string): string {
  const ticker = disclosure.ticker ? ` <b>[${escapeTelegramHtml(disclosure.ticker)}]</b>` : "";
  const lines = [
    "<b>IDX keyword alert</b>",
    `🕒 ${escapeTelegramHtml(disclosure.publishedLabel)} WIB`,
    `🔎 Matched: <code>${escapeTelegramHtml(keyword)}</code>`,
    `📣${ticker} ${escapeTelegramHtml(disclosure.title)}`,
    `<a href="${safeLink(disclosure.primaryUrl)}">Open primary disclosure</a>`
  ];

  if (disclosure.attachments.length > 0) {
    lines.push("", "<b>Attachments</b>");
    for (const attachment of disclosure.attachments.slice(0, 8)) {
      lines.push(`• <a href="${safeLink(attachment.url)}">${escapeTelegramHtml(attachment.name)}</a>`);
    }
    if (disclosure.attachments.length > 8) lines.push(`• …and ${disclosure.attachments.length - 8} more`);
  }
  const message = lines.join("\n");
  return message.length <= 4_000 ? message : `${message.slice(0, 3_950)}\n…message shortened`;
}

export class TelegramNotifier implements NotificationSender {
  lastDeliveryStatus: "never" | "ok" | "failed" = "never";
  private readonly endpoint: string;

  constructor(
    botToken: string,
    private readonly chatId: string,
    private readonly logger: Logger,
    endpointBase = "https://api.telegram.org"
  ) {
    this.endpoint = `${endpointBase.replace(/\/$/, "")}/bot${botToken}/sendMessage`;
  }

  sendDisclosure(disclosure: Disclosure, matchedKeyword: string): Promise<void> {
    return this.send(formatDisclosureMessage(disclosure, matchedKeyword));
  }

  sendOperational(message: string): Promise<void> {
    return this.send(`<b>IDX monitor status</b>\n${escapeTelegramHtml(message)}`);
  }

  private async send(text: string): Promise<void> {
    try {
      await withRetry(async () => {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: this.chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true
          }),
          signal: AbortSignal.timeout(15_000)
        });
        const body = await response.text();
        if (!response.ok) throw new Error(`Telegram API returned ${response.status}: ${body.slice(0, 300)}`);
      }, {
        attempts: 3,
        initialDelayMs: 750,
        maximumDelayMs: 3_000,
        onRetry: (error, attempt, delayMs) => this.logger.warn("Telegram delivery failed; retrying", {
          attempt, delayMs, error: errorMessage(error)
        })
      });
      this.lastDeliveryStatus = "ok";
    } catch (error) {
      this.lastDeliveryStatus = "failed";
      throw error;
    }
  }
}
