import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { IspApiService } from './isp-api.service.ts'
import { IspApiException } from '../../domain/exceptions/isp-api.exception.ts'

describe('Infrastructure: ISP API Client', () => {
    let client: IspApiService

    before(() => {
        client = new IspApiService()
    })

    it('handles network failures', async () => {
        client.configure({
            baseUrl: 'http://127.0.0.1:65432',
            user: 'admin',
            password: '123'
        })

        try {
            await client.login()
            assert.fail('Should have thrown a network exception')
        } catch (error) {
            assert.ok(error instanceof IspApiException)
            assert.equal(error.status, 0)
            assert.match(error.message, /Network failure|fetch failed/i)
        }
    })

    describe('Anomalous HTTP responses', () => {
        const originalFetch = global.fetch

        after(() => {
            global.fetch = originalFetch
        })

        it('handles responses with invalid JSON', async () => {
            global.fetch = async () => new Response('<html>Error 502 Bad Gateway</html>', { 
                status: 502,
                statusText: 'Bad Gateway'
            })

            client.configure({ baseUrl: 'http://fake-api', user: 'x', password: 'y' })

            try {
                await client.login()
                assert.fail('Should have failed to parse')
            } catch (error) {
                assert.ok(error instanceof IspApiException)
                assert.equal(error.status, 502)
                assert.match(error.message, /invalid JSON/i)
            }
        })

        it('handles HTTP 500 errors with valid JSON but unexpected structure', async () => {
            global.fetch = async () => new Response(JSON.stringify({ critical_error: 'Database exploded' }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            })

            try {
                await client.login()
                assert.fail('Should have failed with HTTP 500')
            } catch (error) {
                assert.ok(error instanceof IspApiException)
                assert.equal(error.status, 500)
                assert.match(error.message, /Unexpected API response|Authentication failed/i)
            }
        })

        it('throws error if lista_ids_contratos does not return an array in data', async () => {
            global.fetch = async (input) => {
                const url = input.toString()
                if (url.includes('/login')) {
                    return new Response(JSON.stringify({ access_token: 'fake-token' }))
                }
                if (url.includes('/lista_ids_contratos')) {
                    return new Response(JSON.stringify({ data: "this is not an array, it is a string" }))
                }
                return new Response('{}')
            }

            client.configure({ baseUrl: 'http://fake-api', user: 'x', password: 'y' })

            try {
                await client.listContractIds()
                assert.fail('Should validate the response shape')
            } catch (error) {
                assert.ok(error instanceof IspApiException)
                assert.equal(error.status, 502)
                assert.match(error.message, /missing data array/i)
            }
        })
    })
})