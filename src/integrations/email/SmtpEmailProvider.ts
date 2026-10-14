import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import type { EmailMessage, EmailProvider } from './EmailProvider';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.config.from, ...message });
  }
}
