// Import Docs
import { bearer403, body, configWriteResponses, error, ok, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Pricing
const paths = {
  '/api/pricing': {
    get: {
      tags: ['Pricing'],
      summary: 'Get pricing rules config',
      description: 'Requires permission: pricing. Returns only pricing rules plus configUpdatedAt.',
      responses: { 200: ok('Pricing config', ref('PricingConfigResponse')), ...bearer403 },
    },
    put: {
      tags: ['Pricing'],
      summary: 'Replace pricing rules (add, edit, and delete rules)',
      description: 'Requires permission: pricing. The only write endpoint for pricing: send the complete pricingRules array. Add a rule = append it without id (the backend creates pr_...), edit = change the item and keep its id, delete = leave it out. Every rule needs price. Fields not sent (pricingRules, paymentChannels, serviceChannelMapping, masterData) keep their current value. Send configUpdatedAt from GET /config (or from the previous PUT response); when it is not the latest saved value the backend returns 409 PRICING_CONFIG_CONFLICT with the latest configUpdatedAt instead of overwriting rules saved by someone else. The response returns the new configUpdatedAt. Invalid hour ranges return 400 INVALID_PRICING_RULES with vehicleType, ruleIndexes (indexes in the sent pricingRules array), and ruleIds (null for new rules sent without id); the message ends with the rule names.',
      requestBody: body({ type: 'object', additionalProperties: true }, {
        configUpdatedAt: '2026-10-05T03:00:00.000Z',
        pricingRules: [
          { id: 'pr_base_car', name: 'Car first 3 hours', feeType: 'base_hour', vehicleType: 'car', hourEnd: 3, price: 30, status: 'active' },
          { name: 'Car next hours', feeType: 'next_hour', vehicleType: 'car', hourStart: 4, hourEnd: 24, price: 20, status: 'active' },
        ],
      }),
      responses: {
        200: ok('Pricing config updated', {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Pricing config updated' },
            configUpdatedAt: { type: 'string', nullable: true, example: '2026-10-05T03:05:00.000Z' },
          },
        }),
        409: error('PRICING_CONFIG_CONFLICT (configUpdatedAt is out of date, reload and try again)'),
        ...configWriteResponses,
      },
    },
  },
};

export default paths;
