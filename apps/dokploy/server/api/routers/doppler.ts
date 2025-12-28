import {
	fetchDopplerConfigs,
	fetchDopplerProjects,
	fetchDopplerSecretNames,
	fetchDopplerSecrets,
	secretsToEnvString,
	testDopplerConnection,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const dopplerRouter = createTRPCRouter({
	testConnection: protectedProcedure
		.input(z.object({ serviceToken: z.string().min(1) }))
		.mutation(async ({ input }) => {
			try {
				const result = await testDopplerConnection(input.serviceToken);
				if (!result.success) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid Doppler service token",
					});
				}
				return result;
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to connect to Doppler: ${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),

	listProjects: protectedProcedure
		.input(z.object({ serviceToken: z.string().min(1) }))
		.query(async ({ input }) => {
			try {
				return await fetchDopplerProjects(input.serviceToken);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to fetch Doppler projects: ${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),

	listConfigs: protectedProcedure
		.input(
			z.object({
				serviceToken: z.string().min(1),
				project: z.string().min(1),
				environment: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await fetchDopplerConfigs(
					input.serviceToken,
					input.project,
					input.environment,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to fetch Doppler configs: ${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),

	previewSecrets: protectedProcedure
		.input(
			z.object({
				serviceToken: z.string().min(1),
				project: z.string().optional(),
				config: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			try {
				const names = await fetchDopplerSecretNames(
					input.serviceToken,
					input.project,
					input.config,
				);
				return { names, count: names.length };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to preview Doppler secrets: ${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),

	syncSecrets: protectedProcedure
		.input(
			z.object({
				serviceToken: z.string().min(1),
				project: z.string().optional(),
				config: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const secrets = await fetchDopplerSecrets(
					input.serviceToken,
					input.project,
					input.config,
				);
				const envString = secretsToEnvString(secrets);
				return {
					env: envString,
					secretCount: Object.keys(secrets).length,
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to sync Doppler secrets: ${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),
});
