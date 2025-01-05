import { PostgresDatabaseAdapter } from "@elizaos/adapter-postgres";
import { SqliteDatabaseAdapter } from "@elizaos/adapter-sqlite";
import { AutoClientInterface } from "@elizaos/client-auto";
import { DiscordClientInterface } from "@elizaos/client-discord";
import { FarcasterAgentClient } from "@elizaos/client-farcaster";
import { LensAgentClient } from "@elizaos/client-lens";
import { SlackClientInterface } from "@elizaos/client-slack";
import { TelegramClientInterface } from "@elizaos/client-telegram";
import { TwitterClientInterface } from "@elizaos/client-twitter";
import { MoonboyPlugin } from "@elizaos/plugin-moonboy"; // Import the Moonboy plugin
import {
    AgentRuntime,
    CacheManager,
    Character,
    Clients,
    DbCacheAdapter,
    defaultCharacter,
    elizaLogger,
    FsCacheAdapter,
    IAgentRuntime,
    IDatabaseAdapter,
    IDatabaseCacheAdapter,
    ModelProviderName,
    settings,
    stringToUuid,
    validateCharacterConfig,
    CacheStore,
    Client,
    ICacheManager,
    parseBooleanFromText,
} from "@elizaos/core";
import { RedisClient } from "@elizaos/adapter-redis";
import { zgPlugin } from "@elizaos/plugin-0g";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import createGoatPlugin from "@elizaos/plugin-goat";
import { DirectClient } from "@elizaos/client-direct";
import { aptosPlugin } from "@elizaos/plugin-aptos";
import {
    advancedTradePlugin,
    coinbaseCommercePlugin,
    coinbaseMassPaymentsPlugin,
    tokenContractPlugin,
    tradePlugin,
    webhookPlugin,
} from "@elizaos/plugin-coinbase";
import { confluxPlugin } from "@elizaos/plugin-conflux";
import { evmPlugin } from "@elizaos/plugin-evm";
import { storyPlugin } from "@elizaos/plugin-story";
import { flowPlugin } from "@elizaos/plugin-flow";
import { fuelPlugin } from "@elizaos/plugin-fuel";
import { imageGenerationPlugin } from "@elizaos/plugin-image-generation";
import { ThreeDGenerationPlugin } from "@elizaos/plugin-3d-generation";
import { multiversxPlugin } from "@elizaos/plugin-multiversx";
import { nearPlugin } from "@elizaos/plugin-near";
import { nftGenerationPlugin } from "@elizaos/plugin-nft-generation";
import { createNodePlugin } from "@elizaos/plugin-node";
import { solanaPlugin } from "@elizaos/plugin-solana";
import { suiPlugin } from "@elizaos/plugin-sui";
import { TEEMode, teePlugin } from "@elizaos/plugin-tee";
import { tonPlugin } from "@elizaos/plugin-ton";
import { zksyncEraPlugin } from "@elizaos/plugin-zksync-era";
import { cronosZkEVMPlugin } from "@elizaos/plugin-cronoszkevm";
import { abstractPlugin } from "@elizaos/plugin-abstract";
import { avalanchePlugin } from "@elizaos/plugin-avalanche";
import { webSearchPlugin } from "@elizaos/plugin-web-search";
import { echoChamberPlugin } from "@elizaos/plugin-echochambers";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import yargs from "yargs";
import net from "net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Run Moonboy Python script
function runMoonboyScript() {
    const scriptPath = path.join(__dirname, "../scripts/back_moonboy.py");

    exec(`python ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error running Moonboy script: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Moonboy script stderr: ${stderr}`);
            return;
        }
        console.log(`Moonboy script output:\n${stdout}`);
    });
}

export async function createAgent(
    character: Character,
    db: IDatabaseAdapter,
    cache: ICacheManager,
    token: string
): Promise<AgentRuntime> {
    elizaLogger.success(
        elizaLogger.successesTitle,
        "Creating runtime for character",
        character.name
    );

    const nodePlugin = createNodePlugin();

    return new AgentRuntime({
        databaseAdapter: db,
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        plugins: [
            bootstrapPlugin,
            nodePlugin,
            MoonboyPlugin, // Register the Moonboy plugin here
            getSecret(character, "IMAGE_GENERATION") ? imageGenerationPlugin : null,
        ].filter(Boolean),
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager: cache,
        fetch: logFetch,
    });
}

async function startAgent(
    character: Character,
    directClient: DirectClient
): Promise<AgentRuntime> {
    let db: IDatabaseAdapter & IDatabaseCacheAdapter;
    try {
        character.id ??= stringToUuid(character.name);
        character.username ??= character.name;

        const token = getTokenForProvider(character.modelProvider, character);
        const dataDir = path.join(__dirname, "../data");

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = initializeDatabase(dataDir) as IDatabaseAdapter &
            IDatabaseCacheAdapter;

        await db.init();

        const cache = initializeCache(
            process.env.CACHE_STORE ?? CacheStore.DATABASE,
            character,
            "",
            db
        ); // "" should be replaced with dir for file system caching.

        const runtime: AgentRuntime = await createAgent(
            character,
            db,
            cache,
            token
        );

        // Start services/plugins/process knowledge
        await runtime.initialize();

        // Start assigned clients
        runtime.clients = await initializeClients(character, runtime);

        // Add to container
        directClient.registerAgent(runtime);

        // Report to console
        elizaLogger.debug(`Started ${character.name} as ${runtime.agentId}`);

        return runtime;
    } catch (error) {
        elizaLogger.error(
            `Error starting agent for character ${character.name}:`,
            error
        );
        if (db) {
            await db.close();
        }
        throw error;
    }
}

const startAgents = async () => {
    const directClient = new DirectClient();
    const args = parseArguments();
    const charactersArg = args.characters || args.character;
    const characters = charactersArg
        ? await loadCharacters(charactersArg)
        : [defaultCharacter];

    for (const character of characters) {
        await startAgent(character, directClient);
    }

    runMoonboyScript(); // Run Moonboy Python script during startup

    const serverPort = parseInt(settings.SERVER_PORT || "3000");
    directClient.start(serverPort);

    elizaLogger.log(
        "Run `pnpm start:client` to start the client and visit the outputted URL."
    );
};

startAgents().catch((error) => {
    elizaLogger.error("Unhandled error in startAgents:", error);
    process.exit(1);
});
