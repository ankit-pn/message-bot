'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

// --- Small UI helpers (JS version) ---
function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
      {children}
    </label>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl bg-white shadow p-6 border border-gray-100">
      <h2 className="text-xl font-semibold mb-1">{title}</h2>
      {subtitle ? <p className="text-sm text-gray-500 mb-4">{subtitle}</p> : null}
      {children}
    </div>
  );
}

function Badge({ color = 'gray', children }) {
  const map = {
    gray: 'bg-gray-100 text-gray-800',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[color]}`}>
      {children}
    </span>
  );
}

export default function WhatsAppApiDemoPage() {
  // You can hardcode your API base here or via env var NEXT_PUBLIC_WHATSAPP_API_BASE
  const [apiBase, setApiBase] = useState(process.env.NEXT_PUBLIC_WHATSAPP_API_BASE || 'http://localhost:4000');

  const [sessionId, setSessionId] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [status, setStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [token, setToken] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollRef = useRef(null);

  // Send form state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [mediaUrls, setMediaUrls] = useState(['']); // multiple URL entries

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const statusColor = useMemo(() => {
    switch (status) {
      case 'READY':
        return 'green';
      case 'QR_GENERATED':
      case 'AUTHENTICATED':
      case 'INITIALIZING':
        return 'yellow';
      case 'DISCONNECTED':
      case 'AUTH_FAILURE':
      case 'ERROR':
        return 'red';
      default:
        return 'gray';
    }
  }, [status]);

  const startPollingStatus = () => {
    if (!sessionId) return;
    setIsPolling(true);
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/check_status?sessionId=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        setStatus(data.status);
        setStatusMessage(data.message || null);
        if (data.status === 'READY' && data.session_token) {
          setToken(data.session_token);
          setIsPolling(false);
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch (e) {
        setError((e && e.message) || 'Failed to check status.');
        setIsPolling(false);
        if (pollRef.current) window.clearInterval(pollRef.current);
      }
    }, 1500);
  };

  const startSession = async () => {
    setError(null);
    setToken(null);
    setStatus(null);
    setStatusMessage(null);
    setQrDataUrl(null);
    setSendResult(null);
    setFile(null);
    setMediaUrls(['']);
    try {
      const res = await fetch(`${apiBase}/get_qr`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessionId(data.sessionId);
      setQrDataUrl(data.qrCode);
      setStatus('QR_GENERATED');
      setStatusMessage('QR generated. Scan with your WhatsApp app.');
      startPollingStatus();
    } catch (e) {
      setError(`Failed to get QR: ${(e && e.message) || e}. If the browser shows a CORS error, enable CORS on the API server or proxy / use same-origin.`);
    }
  };

  const checkStatusOnce = async () => {
    if (!sessionId) return;
    setError(null);
    try {
      const res = await fetch(`${apiBase}/check_status?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      setStatus(data.status);
      setStatusMessage(data.message || null);
      if (data.status === 'READY' && data.session_token) setToken(data.session_token);
    } catch (e) {
      setError((e && e.message) || 'Failed to check status.');
    }
  };

  const addUrlRow = () => setMediaUrls((prev) => [...prev, '']);
  const updateUrl = (i, v) => setMediaUrls((prev) => prev.map((u, idx) => (idx === i ? v : u)));
  const removeUrl = (i) => setMediaUrls((prev) => prev.filter((_, idx) => idx !== i));

  const canSend = !!token && !!phoneNumber && (message.trim().length > 0 || file !== null || mediaUrls.some((u) => u.trim().length > 0));

  const send = async () => {
    if (!token) {
      setError('Missing auth token. Start & authenticate a session first.');
      return;
    }
    if (!phoneNumber) {
      setError('Phone number is required.');
      return;
    }
    if (!message && !file && !mediaUrls.some((u) => u.trim().length > 0)) {
      setError('Provide either a message or at least one media item.');
      return;
    }

    setSending(true);
    setError(null);
    setSendResult(null);

    try {
      // We'll use multipart FormData for all cases.
      // IMPORTANT: The backend accepts only a *single* uploaded file field named 'media'.
      // If you want to send multiple media items, prefer the URL-based JSON payload (no file upload).
      const form = new FormData();
      form.append('phoneNumber', phoneNumber);
      if (message) form.append('message', message);
      if (file) form.append('media', file);

      // Only include URL-based media when NO file is selected to avoid field name conflicts with upload.single('media')
      const urlObjs = mediaUrls
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
        .map((u) => ({ url: u }));

      if (!file && urlObjs.length > 0) {
        form.append('media', JSON.stringify(urlObjs));
      }

      const res = await fetch(`${apiBase}/send_message`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error((data && data.error) || 'Send failed');
      setSendResult(data.messageIds || []);
    } catch (e) {
      setError((e && e.message) || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const resetAll = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setSessionId(null);
    setToken(null);
    setStatus(null);
    setStatusMessage(null);
    setQrDataUrl(null);
    setIsPolling(false);
    setPhoneNumber('');
    setMessage('');
    setFile(null);
    setMediaUrls(['']);
    setSendResult(null);
    setError(null);
  };

  const copy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp API Frontend (Next.js, JS)</h1>
          <p className="text-gray-600 mt-2">
            Connect to your Node server, scan the QR, then send text and media messages. Built for the Express + whatsapp-web.js API you provided.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Session controls */}
          <div className="lg:col-span-1 space-y-6">
            <Section title="1) Configure API" subtitle="Point this UI at your running server.">
              <div className="space-y-2">
                <Label htmlFor="apiBase">API Base URL</Label>
                <input
                  id="apiBase"
                  type="text"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  placeholder="http://localhost:4000"
                  className="w-full rounded-xl border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500">You can also set NEXT_PUBLIC_WHATSAPP_API_BASE at build time.</p>
              </div>
            </Section>

            <Section title="2) Create Session" subtitle="Request a QR code and authenticate.">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={startSession}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    Get QR
                  </button>
                  <button
                    onClick={checkStatusOnce}
                    disabled={!sessionId}
                    className="px-4 py-2 rounded-xl bg-gray-200 text-gray-800 font-medium hover:bg-gray-300 disabled:opacity-50"
                  >
                    Check Status
                  </button>
                  <button
                    onClick={resetAll}
                    className="px-4 py-2 rounded-xl bg-white border font-medium hover:bg-gray-50"
                  >
                    Reset
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Status:</span>
                    <Badge color={statusColor}>{status || '—'}</Badge>
                    {isPolling ? <Badge color="blue">polling…</Badge> : null}
                  </div>
                  {statusMessage ? <p className="text-sm text-gray-500">{statusMessage}</p> : null}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Session ID:</span>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">{sessionId || '—'}</code>
                    {sessionId ? (
                      <button onClick={() => copy(sessionId)} className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">
                        Copy
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Token:</span>
                    <code className="text-[10px] break-all bg-gray-100 px-2 py-1 rounded block max-w-full">{token || '—'}</code>
                    {token ? (
                      <button onClick={() => copy(token)} className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">
                        Copy
                      </button>
                    ) : null}
                  </div>
                </div>

                {qrDataUrl ? (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600 mb-2">Scan this QR with WhatsApp on your phone:</p>
                    <div className="rounded-xl border bg-white p-3 inline-block shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="WhatsApp QR" className="h-56 w-56 object-contain" />
                    </div>
                  </div>
                ) : null}
              </div>
            </Section>
          </div>

          {/* Right column: Send form */}
          <div className="lg:col-span-2">
            <Section
              title="3) Send Message"
              subtitle="Requires an active session (status READY). You can send text only, a single uploaded file, or multiple media URLs."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="phone">Recipient phone number</Label>
                    <input
                      id="phone"
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 911234567890"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full rounded-xl border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Numbers are sent as <code className="bg-gray-100 px-1 rounded">{`<digits>@c.us`}</code> on the server.</p>
                  </div>

                  <div>
                    <Label htmlFor="message">Text message (optional)</Label>
                    <textarea
                      id="message"
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your message…"
                      className="w-full rounded-xl border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <Label>Single file upload (optional)</Label>
                    <input
                      type="file"
                      onChange={(e) => setFile((e.target.files && e.target.files[0]) || null)}
                      className="mt-1 block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">The API accepts <strong>one</strong> uploaded file per request under field name <code className="bg-gray-100 px-1 rounded">media</code>.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label>Media URLs (0–N)</Label>
                    <div className="space-y-2">
                      {mediaUrls.map((u, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="https://example.com/image.jpg"
                            value={u}
                            onChange={(e) => updateUrl(i, e.target.value)}
                            className="flex-1 rounded-xl border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            disabled={!!file}
                          />
                          <button
                            type="button"
                            onClick={() => removeUrl(i)}
                            className="px-3 rounded-xl border bg-white hover:bg-gray-50 disabled:opacity-50"
                            disabled={mediaUrls.length <= 1}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button type="button" onClick={addUrlRow} className="px-3 py-1.5 rounded-xl bg-gray-200 hover:bg-gray-300 disabled:opacity-50" disabled={!!file}>
                          + Add URL
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        If you select a file above, URL-based media are disabled for this request to avoid field-name conflicts with the backend's <code className="bg-gray-100 px-1 rounded">upload.single('media')</code>. For multiple media in one go, leave the file empty and use URLs.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={send}
                      disabled={!canSend || sending}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                    <p className="text-[11px] text-gray-500 mt-2">Authorization header is set automatically using the token from <code className="bg-gray-100 px-1 rounded">/check_status</code>.</p>
                  </div>
                </div>
              </div>

              {sendResult ? (
                <div className="mt-5">
                  <div className="rounded-xl border bg-green-50 text-green-800 px-4 py-3">
                    <p className="font-medium">Sent!</p>
                    <p className="text-sm mt-1">Message IDs:</p>
                    <ul className="list-disc list-inside text-sm break-all">
                      {sendResult.map((id, idx) => (
                        <li key={idx}>{id}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="mt-5">
                  <div className="rounded-xl border bg-red-50 text-red-800 px-4 py-3">
                    <p className="font-medium">Error</p>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{error}</p>
                  </div>
                </div>
              ) : null}
            </Section>

            <div className="mt-6 text-xs text-gray-500">
              <p>
                Tip: If you encounter CORS errors in the browser, either enable CORS on the Node server, host this page on the same origin, or proxy requests (e.g., Next.js rewrites).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
