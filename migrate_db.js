import * as fs from "fs";
import * as path from "path";
import "dotenv";
import Database from "better-sqlite3";

const DB_FILE = path.join(process.cwd(), "database_decrypted.json");
const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

const db = new Database('database.sqlite');

function migrate() {
    // migrate API keys just to check
    const insertProvider = db.prepare(`INSERT INTO providers (id, name,
        base_url, enabled, created_at, custom_headers, disable_cache_discount)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
    
    const insertApiKey = db.prepare(`INSERT INTO api_keys (id, provider_id,
        key, last_used, request_count) VALUES (?, ?, ?, ?, ?)`);

    const insertModel = db.prepare(`INSERT OR IGNORE INTO models (id,
        provider_id, model_id, enabled, request_cost) VALUES (?, ?, ?, ?, ?)`);

    const insertUserToken = db.prepare(`INSERT INTO user_tokens (id, name,
        token, max_rpd, max_rpm, created_at, allowed_providers,
        parent_token_id, key_type, expires_at, enabled, sigma_boy,
        max_sub_keys) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
    const providers = data.providers;
    const keys = data.apiKeys;
    const models = data.models;
    const userTokens = data.userTokens;

    let timeStart = Date.now();

    const insertAll = db.transaction((providers, keys, models, userTokens) => {
        console.log(`Starting transaction: ${providers.length} providers, ${keys.length} keys, ${models.length} models`);
        
        for (const provider of providers) {
            insertProvider.run(provider.id, provider.name, provider.baseUrl,
                provider.enabled ? 1 : 0, provider.createdAt,
                (provider.customHeaders ? JSON.stringify(provider.customHeaders) : null), provider.disableCacheDiscount ? 1 : 0);
        }

        for (const key of keys) {
            insertApiKey.run(key.id, key.providerId, key.key, key.lastUsed,
                key.requestCount);
        }

        for (const model of models) {
            insertModel.run(model.id, model.providerId, model.modelId,
                model.enabled ? 1 : 0, model.requestCost);
        }
        
        for (const token of userTokens) {
            /*
            id, name, token, max_rpd, max_rpm, created_at,
            allowed_providers, parent_token_id, key_type,
            expires_at, enabled, sigma_boy, max_sub_keys
            */
           if (!token.name || !token.token) {
            console.log(token);
            continue;
           }
            insertUserToken.run(token.id, token.name ?? "EMPTY", token.token,
                token.maxRPD, token.maxRPM, token.createdAt,
                JSON.stringify(token.allowedProviders),
                (token.parentTokenId ?? null), token.keyType,
                (token.expiresAt ?? null), (token.disabled ? 0 : 1),
                token.sigmaBoy ? 1 : 0,
                (token.maxSubKeys ?? null));
        }

        console.log("Transaction completed successfully");
    });

    insertAll(providers, keys, models, userTokens);

    console.log(`${Date.now() - timeStart}ms`);

    timeStart = Date.now();

    const usageRecords = data.usageRecords;

    // Prepare a statement to look up the model UUID by name and provider
    const getModelById = db.prepare(`SELECT id FROM models WHERE model_id = ? AND provider_id = ?`);

    const insertUsageRecord = db.prepare(`INSERT OR IGNORE INTO usage_records (
        id, user_token_id, model_id, provider_id, tokens,
        input_tokens, output_tokens, timestamp, cost) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    let usages = 0;
    const insertAllUsages = db.transaction((usageRecords) => {
        for (const record of usageRecords) {
            // resolve modelID (name) -> model.id (UUID)
            const modelLookup = getModelById.get(record.modelId, record.providerId);
            if (!modelLookup) {
                // console.log(`Model not found: ${record.modelId} for provider ${record.providerId}`);
                continue;
            }
            
            try {
            insertUsageRecord.run(record.id, record.userTokenId,
                modelLookup.id, record.providerId, record.tokens,
                record.inputTokens, record.outputTokens,
                record.timestamp, record.cost);
            } catch (e) {
                continue;
            }
            if (usages % 10000 == 0) {
                console.log(`Usages: ${usages}`);
            }
            ++usages;
        }
    });

    insertAllUsages(usageRecords);

    console.log(`${Date.now() - timeStart}ms`);
}

migrate();