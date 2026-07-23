import axios, { AxiosError, AxiosInstance } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { attachRetry } from './retry.js';

describe('attachRetry', () => {
  let client: AxiosInstance;
  let mock: MockAdapter;

  beforeEach(() => {
    client = axios.create();
    // Backoff at 1ms to keep tests fast
    attachRetry(client, { baseDelayMs: 1, maxRetries: 3 });
    mock = new MockAdapter(client);
  });

  afterEach(() => {
    mock.reset();
  });

  it('retries a GET on 503 and eventually succeeds', async () => {
    mock
      .onGet('/x')
      .replyOnce(503)
      .onGet('/x')
      .replyOnce(503)
      .onGet('/x')
      .replyOnce(200, { ok: true });

    const res = await client.get('/x');
    expect(res.data).toEqual({ ok: true });
    expect(mock.history.get).toHaveLength(3);
  });

  it('retries on 429 for any method', async () => {
    mock.onPost('/m').replyOnce(429).onPost('/m').replyOnce(200, 'created');
    const res = await client.post('/m', {});
    expect(res.data).toBe('created');
    expect(mock.history.post).toHaveLength(2);
  });

  it('does not retry POST on 503', async () => {
    mock.onPost('/m').reply(503);
    await expect(client.post('/m', {})).rejects.toBeInstanceOf(AxiosError);
    expect(mock.history.post).toHaveLength(1);
  });

  it('does not retry on 400', async () => {
    mock.onGet('/x').reply(400);
    await expect(client.get('/x')).rejects.toBeInstanceOf(AxiosError);
    expect(mock.history.get).toHaveLength(1);
  });

  it('gives up after maxRetries and rethrows', async () => {
    mock.onGet('/x').reply(503);
    await expect(client.get('/x')).rejects.toBeInstanceOf(AxiosError);
    expect(mock.history.get).toHaveLength(4); // 1 initial + 3 retries
  });

  it('retries on network errors for GET', async () => {
    mock.onGet('/x').networkErrorOnce().onGet('/x').replyOnce(200, 'ok');
    const res = await client.get('/x');
    expect(res.data).toBe('ok');
    expect(mock.history.get).toHaveLength(2);
  });
});
