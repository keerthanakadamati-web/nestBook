import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { subject?: string; body?: string; societyName?: string }

const Email = ({ subject, body, societyName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{subject ?? (societyName ? `Update from ${societyName}` : 'Update from your apartment committee')}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{societyName ? `NestInLedger – ${societyName}` : 'NestInLedger'}</Heading>
        {(body ?? '').split('\n').map((line, i) => (
          <Text key={i} style={line ? text : spacer}>{line || '\u00a0'}</Text>
        ))}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => String(d['subject'] ?? 'Update from NestInLedger'),
  displayName: 'Society notice (reminders, receipts, complaints)',
  previewData: { subject: 'Maintenance due for Flat 101 — Rs. 1,500', body: 'Dear owner,\n\nYour maintenance of Rs. 1,500 is due.\n\nPlease pay in NestInLedger.' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', borderTop: '4px solid #0f2a4a' }
const h1 = { color: '#0f2a4a', fontSize: '20px', margin: '0 0 16px' }
const text = { color: '#1f2937', fontSize: '14px', lineHeight: '20px', margin: '0' }
const spacer = { ...text, lineHeight: '10px' }
