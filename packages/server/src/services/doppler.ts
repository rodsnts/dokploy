import { TRPCError } from "@trpc/server";

export type DopplerMergeStrategy =
	| "doppler_priority"
	| "manual_priority"
	| "doppler_only"
	| "manual_only";

export interface DopplerConfig {
	enabled: boolean;
	serviceToken: string | null;
	project: string | null;
	config: string | null;
	mergeStrategy: DopplerMergeStrategy;
}

export interface DopplerSecrets {
	[key: string]: string;
}

export interface DopplerProject {
	id: string;
	slug: string;
	name: string;
	description: string;
	created_at: string;
}

export interface DopplerEnvironment {
	id: string;
	slug: string;
	name: string;
	project: string;
	created_at: string;
}

export interface DopplerConfigItem {
	name: string;
	root: boolean;
	locked: boolean;
	environment: string;
	project: string;
	created_at: string;
}

const DOPPLER_API_BASE = "https://api.doppler.com/v3";

async function dopplerFetch<T>(
	endpoint: string,
	token: string,
	options: RequestInit = {},
): Promise<T> {
	const response = await fetch(`${DOPPLER_API_BASE}${endpoint}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Doppler API error (${response.status}): ${errorText}`,
		});
	}

	return response.json();
}

export async function testDopplerConnection(serviceToken: string): Promise<{
	success: boolean;
	workplace?: string;
	tokenType?: string;
}> {
	try {
		const response = await dopplerFetch<{
			workplace: { id: string; name: string };
			token_preview: string;
			type: string;
		}>("/me", serviceToken);

		return {
			success: true,
			workplace: response.workplace?.name,
			tokenType: response.type,
		};
	} catch {
		return { success: false };
	}
}

export async function fetchDopplerProjects(
	serviceToken: string,
): Promise<DopplerProject[]> {
	const response = await dopplerFetch<{ projects: DopplerProject[] }>(
		"/projects",
		serviceToken,
	);
	return response.projects;
}

export async function fetchDopplerEnvironments(
	serviceToken: string,
	project: string,
): Promise<DopplerEnvironment[]> {
	const response = await dopplerFetch<{ environments: DopplerEnvironment[] }>(
		`/environments?project=${encodeURIComponent(project)}`,
		serviceToken,
	);
	return response.environments;
}

export async function fetchDopplerConfigs(
	serviceToken: string,
	project: string,
	environment?: string,
): Promise<DopplerConfigItem[]> {
	let endpoint = `/configs?project=${encodeURIComponent(project)}`;
	if (environment) {
		endpoint += `&environment=${encodeURIComponent(environment)}`;
	}
	const response = await dopplerFetch<{ configs: DopplerConfigItem[] }>(
		endpoint,
		serviceToken,
	);
	return response.configs;
}

export async function fetchDopplerSecrets(
	serviceToken: string,
	project?: string,
	config?: string,
): Promise<DopplerSecrets> {
	let endpoint = "/configs/config/secrets/download?format=json";
	if (project) {
		endpoint += `&project=${encodeURIComponent(project)}`;
	}
	if (config) {
		endpoint += `&config=${encodeURIComponent(config)}`;
	}

	return dopplerFetch<DopplerSecrets>(endpoint, serviceToken);
}

export async function fetchDopplerSecretNames(
	serviceToken: string,
	project?: string,
	config?: string,
): Promise<string[]> {
	let endpoint = "/configs/config/secrets/names?include_dynamic_secrets=false";
	if (project) {
		endpoint += `&project=${encodeURIComponent(project)}`;
	}
	if (config) {
		endpoint += `&config=${encodeURIComponent(config)}`;
	}

	const response = await dopplerFetch<{ names: string[] }>(
		endpoint,
		serviceToken,
	);
	return response.names;
}

export function secretsToEnvString(secrets: DopplerSecrets): string {
	return Object.entries(secrets)
		.map(([key, value]) => {
			const escapedValue = value.includes("\n")
				? `"${value.replace(/"/g, '\\"')}"`
				: value;
			return `${key}=${escapedValue}`;
		})
		.join("\n");
}

export function envStringToSecrets(env: string): DopplerSecrets {
	const secrets: DopplerSecrets = {};
	const lines = env.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const equalIndex = trimmed.indexOf("=");
		if (equalIndex === -1) continue;

		const key = trimmed.slice(0, equalIndex);
		let value = trimmed.slice(equalIndex + 1);

		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		secrets[key] = value;
	}

	return secrets;
}

export function mergeEnvStrings(
	manualEnv: string | null | undefined,
	dopplerSecrets: DopplerSecrets,
	strategy: DopplerMergeStrategy,
): string {
	if (strategy === "doppler_only") {
		return secretsToEnvString(dopplerSecrets);
	}

	if (strategy === "manual_only") {
		return manualEnv || "";
	}

	const manualSecrets = envStringToSecrets(manualEnv || "");

	let merged: DopplerSecrets;
	if (strategy === "doppler_priority") {
		merged = { ...manualSecrets, ...dopplerSecrets };
	} else {
		merged = { ...dopplerSecrets, ...manualSecrets };
	}

	return secretsToEnvString(merged);
}

export interface ResolvedDopplerConfig {
	enabled: boolean;
	serviceToken: string;
	project: string | null;
	config: string | null;
	mergeStrategy: DopplerMergeStrategy;
	source: "service" | "environment" | "project";
}

export function resolveDopplerConfig(
	projectConfig: DopplerConfig | null,
	environmentConfig: DopplerConfig | null,
	serviceConfig: DopplerConfig | null,
): ResolvedDopplerConfig | null {
	if (serviceConfig?.enabled && serviceConfig.serviceToken) {
		return {
			enabled: true,
			serviceToken: serviceConfig.serviceToken,
			project: serviceConfig.project,
			config: serviceConfig.config,
			mergeStrategy: serviceConfig.mergeStrategy,
			source: "service",
		};
	}

	if (environmentConfig?.enabled && environmentConfig.serviceToken) {
		return {
			enabled: true,
			serviceToken: environmentConfig.serviceToken,
			project: environmentConfig.project,
			config: environmentConfig.config,
			mergeStrategy: environmentConfig.mergeStrategy,
			source: "environment",
		};
	}

	if (projectConfig?.enabled && projectConfig.serviceToken) {
		return {
			enabled: true,
			serviceToken: projectConfig.serviceToken,
			project: projectConfig.project,
			config: projectConfig.config,
			mergeStrategy: projectConfig.mergeStrategy,
			source: "project",
		};
	}

	return null;
}

export async function syncDopplerSecretsToEnv(
	currentEnv: string | null | undefined,
	dopplerConfig: ResolvedDopplerConfig,
): Promise<{ env: string; secretCount: number }> {
	const secrets = await fetchDopplerSecrets(
		dopplerConfig.serviceToken,
		dopplerConfig.project ?? undefined,
		dopplerConfig.config ?? undefined,
	);

	const mergedEnv = mergeEnvStrings(
		currentEnv,
		secrets,
		dopplerConfig.mergeStrategy,
	);

	return {
		env: mergedEnv,
		secretCount: Object.keys(secrets).length,
	};
}

export interface ServiceWithDoppler {
	env?: string | null;
	dopplerEnabled?: boolean | null;
	dopplerServiceToken?: string | null;
	dopplerProject?: string | null;
	dopplerConfig?: string | null;
	dopplerMergeStrategy?: string | null;
}

export interface EnvironmentWithDoppler {
	env?: string | null;
	dopplerEnabled?: boolean | null;
	dopplerServiceToken?: string | null;
	dopplerProject?: string | null;
	dopplerConfig?: string | null;
	dopplerMergeStrategy?: string | null;
}

export interface ProjectWithDoppler {
	env?: string | null;
	dopplerEnabled?: boolean | null;
	dopplerServiceToken?: string | null;
	dopplerProject?: string | null;
	dopplerConfig?: string | null;
	dopplerMergeStrategy?: string | null;
}

function toDopplerConfig(
	entity:
		| ServiceWithDoppler
		| EnvironmentWithDoppler
		| ProjectWithDoppler
		| null
		| undefined,
): DopplerConfig | null {
	if (!entity) return null;
	return {
		enabled: entity.dopplerEnabled ?? false,
		serviceToken: entity.dopplerServiceToken ?? null,
		project: entity.dopplerProject ?? null,
		config: entity.dopplerConfig ?? null,
		mergeStrategy:
			(entity.dopplerMergeStrategy as DopplerMergeStrategy) ??
			"doppler_priority",
	};
}

export async function getEnvWithDopplerSecrets(
	service: ServiceWithDoppler,
	environment?: EnvironmentWithDoppler | null,
	project?: ProjectWithDoppler | null,
): Promise<string> {
	const serviceConfig = toDopplerConfig(service);
	const environmentConfig = toDopplerConfig(environment);
	const projectConfig = toDopplerConfig(project);

	const resolvedConfig = resolveDopplerConfig(
		projectConfig,
		environmentConfig,
		serviceConfig,
	);

	if (!resolvedConfig) {
		return service.env ?? "";
	}

	try {
		const { env } = await syncDopplerSecretsToEnv(service.env, resolvedConfig);
		return env;
	} catch (error) {
		console.error("Failed to fetch Doppler secrets:", error);
		return service.env ?? "";
	}
}
