import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly calendarId: string;
  private readonly auth: any;

  constructor(private config: ConfigService) {
    this.calendarId = config.get('GOOGLE_CALENDAR_ID') ?? '';

    this.auth = new google.auth.JWT({
      email: config.get('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      key: (config.get('GOOGLE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
  }

  async checkAvailability(dateTime: Date, durationMin = 60): Promise<{ available: boolean; conflictingEvent?: string }> {
    const endTime = new Date(dateTime.getTime() + durationMin * 60 * 1000);

    try {
      const calendar = google.calendar({ version: 'v3', auth: this.auth });

      const response = await calendar.events.list({
        calendarId: this.calendarId,
        timeMin: dateTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: true,
      });

      const events = response.data.items ?? [];
      if (events.length === 0) return { available: true };

      return {
        available: false,
        conflictingEvent: events[0].summary ?? 'Evento existente',
      };
    } catch (err) {
      this.logger.error(`Erro ao verificar disponibilidade: ${err.message}`);
      return { available: true }; // em caso de erro, deixa prosseguir
    }
  }

  async createAppointment(params: {
    leadName: string;
    phone: string;
    symptoms: string;
    startDateTime: Date;
    durationMin?: number;
  }): Promise<{ id: string; htmlLink: string } | null> {
    const { leadName, phone, symptoms, startDateTime, durationMin = 60 } = params;
    const endDateTime = new Date(startDateTime.getTime() + durationMin * 60 * 1000);

    try {
      const calendar = google.calendar({ version: 'v3', auth: this.auth });

      const event = await calendar.events.insert({
        calendarId: this.calendarId,
        requestBody: {
          summary: `Consulta — ${leadName}`,
          description: `Paciente: ${leadName}\nWhatsApp: ${phone}\nSintomas: ${symptoms || 'Não informado'}`,
          start: { dateTime: startDateTime.toISOString(), timeZone: 'America/Sao_Paulo' },
          end:   { dateTime: endDateTime.toISOString(),   timeZone: 'America/Sao_Paulo' },
        },
      });

      this.logger.log(`Evento criado: ${event.data.htmlLink}`);
      return { id: event.data.id ?? '', htmlLink: event.data.htmlLink ?? '' };
    } catch (err) {
      this.logger.error(`Erro ao criar evento: ${err.message}`);
      return null;
    }
  }

  async cancelAppointment(eventId: string): Promise<boolean> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.auth });
      await calendar.events.delete({ calendarId: this.calendarId, eventId });
      this.logger.log(`Evento cancelado: ${eventId}`);
      return true;
    } catch (err) {
      this.logger.error(`Erro ao cancelar evento: ${err.message}`);
      return false;
    }
  }

  async updateAppointment(eventId: string, newDateTime: Date, durationMin = 60): Promise<boolean> {
    const endDateTime = new Date(newDateTime.getTime() + durationMin * 60 * 1000);

    try {
      const calendar = google.calendar({ version: 'v3', auth: this.auth });
      await calendar.events.patch({
        calendarId: this.calendarId,
        eventId,
        requestBody: {
          start: { dateTime: newDateTime.toISOString(), timeZone: 'America/Sao_Paulo' },
          end:   { dateTime: endDateTime.toISOString(), timeZone: 'America/Sao_Paulo' },
        },
      });
      this.logger.log(`Evento reagendado: ${eventId} → ${newDateTime.toISOString()}`);
      return true;
    } catch (err) {
      this.logger.error(`Erro ao reagendar evento: ${err.message}`);
      return false;
    }
  }
}
