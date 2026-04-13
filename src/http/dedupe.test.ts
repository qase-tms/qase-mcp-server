import axios, { AxiosInstance } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { attachInflightDedupe } from './dedupe.js';

describe('attachInflightDedupe', () => {
  let client: AxiosInstance;
  let mock: MockAdapter;

  beforeEach(() => {
    client = axios.create();
    mock = new MockAdapter(client);
    attachInflightDedupe(client);
  });

  afterEach(() => mock.reset());

  it('coalesces two concurrent identical GETs into one network call', async () => {
    let calls = 0;
    mock.onGet('/x').reply(() => {
      calls += 1;
      return [200, { n: calls }];
    });

    const [a, b] = await Promise.all([client.get('/x'), client.get('/x')]);
    expect(calls).toBe(1);
    expect(a.data).toEqual(b.data);
  });

  it('does not coalesce GETs with different query params', async () => {
    let calls = 0;
    mock.onGet(/\/x/).reply(() => {
      calls += 1;
      return [200, { n: calls }];
    });

    await Promise.all([client.get('/x', { params: { a: 1 } }), client.get('/x', { params: { a: 2 } })]);
    expect(calls).toBe(2);
  });

  it('does not coalesce POST requests', async () => {
    let calls = 0;
    mock.onPost('/m').reply(() => {
      calls += 1;
      return [200, { n: calls }];
    });

    await Promise.all([client.post('/m', { x: 1 }), client.post('/m', { x: 1 })]);
    expect(calls).toBe(2);
  });

  it('releases the in-flight slot after completion so subsequent GETs hit the network', async () => {
    let calls = 0;
    mock.onGet('/x').reply(() => {
      calls += 1;
      return [200, { n: calls }];
    });

    await client.get('/x');
    await client.get('/x');
    expect(calls).toBe(2);
  });
});
