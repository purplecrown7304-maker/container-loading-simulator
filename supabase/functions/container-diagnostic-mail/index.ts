const RECIPIENT = 'qkrgudtls7304@gmail.com';
const MAX_BASE64_LENGTH = 17_000_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function validFilename(value: unknown): value is string {
  return typeof value === 'string'
    && /^loading-system-check-[0-9]{8}-[0-9]{4}\.zip$/.test(value)
    && value.length < 100;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);

  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const from = Deno.env.get('DIAGNOSTIC_MAIL_FROM') ?? '';
  if (!resendApiKey || !from) {
    return json({ error: '점검 메일 발송 서버 설정이 아직 완료되지 않았습니다.' }, 503);
  }

  let payload: { filename?: unknown; zipBase64?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: '요청 형식이 올바르지 않습니다.' }, 400);
  }

  if (!validFilename(payload.filename)) return json({ error: '점검 ZIP 파일명이 올바르지 않습니다.' }, 400);
  if (typeof payload.zipBase64 !== 'string' || !payload.zipBase64 || payload.zipBase64.length > MAX_BASE64_LENGTH) {
    return json({ error: '점검 ZIP 데이터가 비어 있거나 허용 크기를 초과했습니다.' }, 400);
  }

  const generatedAt = new Date();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [RECIPIENT],
      subject: `[Container Loading] 점검 파일 ${generatedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
      text: `Container Loading Simulator에서 생성한 점검 파일입니다.\n\n파일: ${payload.filename}\n생성/발송 시각: ${generatedAt.toISOString()}\n`,
      attachments: [{ filename: payload.filename, content: payload.zipBase64 }],
    }),
  });

  const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) {
    console.error('Resend diagnostic mail failed', response.status, result);
    return json({ error: result.message || '메일 발송 서비스가 요청을 처리하지 못했습니다.' }, 502);
  }

  return json({ ok: true, recipient: RECIPIENT, messageId: result.id ?? null });
});
