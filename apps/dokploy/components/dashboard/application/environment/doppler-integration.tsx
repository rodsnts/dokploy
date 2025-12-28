import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

const dopplerSchema = z.object({
	dopplerEnabled: z.boolean().default(false),
	dopplerServiceToken: z.string().optional(),
	dopplerProject: z.string().optional(),
	dopplerConfig: z.string().optional(),
	dopplerMergeStrategy: z
		.enum([
			"doppler_priority",
			"manual_priority",
			"doppler_only",
			"manual_only",
		])
		.default("doppler_priority"),
});

type DopplerFormData = z.infer<typeof dopplerSchema>;

interface DopplerConfig {
	dopplerEnabled?: boolean | null;
	dopplerServiceToken?: string | null;
	dopplerProject?: string | null;
	dopplerConfig?: string | null;
	dopplerMergeStrategy?: string | null;
	dopplerLastSyncAt?: string | null;
}

interface Props {
	data: DopplerConfig | null | undefined;
	onSave: (data: DopplerFormData) => Promise<void>;
	isLoading?: boolean;
	inheritedFrom?: {
		source: "project" | "environment";
		enabled: boolean;
		project?: string | null;
		config?: string | null;
	} | null;
}

export const DopplerIntegration = ({
	data,
	onSave,
	isLoading: isSaving,
	inheritedFrom,
}: Props) => {
	const [connectionStatus, setConnectionStatus] = useState<
		"idle" | "testing" | "success" | "error"
	>("idle");

	const form = useForm<DopplerFormData>({
		defaultValues: {
			dopplerEnabled: false,
			dopplerServiceToken: "",
			dopplerProject: "",
			dopplerConfig: "",
			dopplerMergeStrategy: "doppler_priority",
		},
		resolver: zodResolver(dopplerSchema),
	});

	const enabled = form.watch("dopplerEnabled");
	const serviceToken = form.watch("dopplerServiceToken");
	const selectedProject = form.watch("dopplerProject");

	useEffect(() => {
		if (data) {
			form.reset({
				dopplerEnabled: data.dopplerEnabled ?? false,
				dopplerServiceToken: data.dopplerServiceToken ?? "",
				dopplerProject: data.dopplerProject ?? "",
				dopplerConfig: data.dopplerConfig ?? "",
				dopplerMergeStrategy:
					(data.dopplerMergeStrategy as DopplerFormData["dopplerMergeStrategy"]) ??
					"doppler_priority",
			});
		}
	}, [data, form]);

	const { mutateAsync: testConnection, isLoading: isTestingConnection } =
		api.doppler.testConnection.useMutation();

	const { data: projects, isLoading: isLoadingProjects } =
		api.doppler.listProjects.useQuery(
			{ serviceToken: serviceToken || "" },
			{
				enabled: !!serviceToken && serviceToken.length > 10 && enabled,
				retry: false,
			},
		);

	const { data: configs, isLoading: isLoadingConfigs } =
		api.doppler.listConfigs.useQuery(
			{ serviceToken: serviceToken || "", project: selectedProject || "" },
			{
				enabled:
					!!serviceToken &&
					!!selectedProject &&
					serviceToken.length > 10 &&
					enabled,
				retry: false,
			},
		);

	const { data: secretPreview, isLoading: isLoadingPreview } =
		api.doppler.previewSecrets.useQuery(
			{
				serviceToken: serviceToken || "",
				project: selectedProject || undefined,
				config: form.watch("dopplerConfig") || undefined,
			},
			{
				enabled:
					!!serviceToken &&
					serviceToken.length > 10 &&
					enabled &&
					connectionStatus === "success",
				retry: false,
			},
		);

	const handleTestConnection = async () => {
		if (!serviceToken) {
			toast.error("Please enter a service token");
			return;
		}

		setConnectionStatus("testing");
		try {
			const result = await testConnection({ serviceToken });
			if (result.success) {
				setConnectionStatus("success");
				toast.success(
					`Connected to Doppler${result.workplace ? ` (${result.workplace})` : ""}`,
				);
			} else {
				setConnectionStatus("error");
				toast.error("Failed to connect to Doppler");
			}
		} catch {
			setConnectionStatus("error");
			toast.error("Failed to connect to Doppler");
		}
	};

	const onSubmit = async (formData: DopplerFormData) => {
		try {
			await onSave(formData);
			toast.success("Doppler settings saved");
		} catch {
			toast.error("Failed to save Doppler settings");
		}
	};

	const hasChanges =
		form.formState.isDirty ||
		form.watch("dopplerEnabled") !== (data?.dopplerEnabled ?? false);

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					Doppler Integration
					{connectionStatus === "success" && (
						<CheckCircle2 className="h-5 w-5 text-green-500" />
					)}
					{connectionStatus === "error" && (
						<XCircle className="h-5 w-5 text-red-500" />
					)}
				</CardTitle>
				<CardDescription>
					Sync environment variables from Doppler secrets manager
					{inheritedFrom?.enabled && (
						<span className="text-muted-foreground ml-2">
							(Inheriting from {inheritedFrom.source})
						</span>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<FormField
							control={form.control}
							name="dopplerEnabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">
											Enable Doppler Integration
										</FormLabel>
										<FormDescription>
											Automatically sync secrets from Doppler on deploy
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						{enabled && (
							<>
								<FormField
									control={form.control}
									name="dopplerServiceToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Service Token</FormLabel>
											<div className="flex gap-2">
												<FormControl>
													<Input
														type="password"
														placeholder="dp.st.xxxx..."
														{...field}
													/>
												</FormControl>
												<Button
													type="button"
													variant="outline"
													onClick={handleTestConnection}
													disabled={isTestingConnection || !serviceToken}
												>
													{isTestingConnection ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : (
														"Test"
													)}
												</Button>
											</div>
											<FormDescription>
												Create a service token in Doppler for this config
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								{connectionStatus === "success" && (
									<>
										<FormField
											control={form.control}
											name="dopplerProject"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Project (Optional)</FormLabel>
													<Select
														onValueChange={field.onChange}
														value={field.value}
														disabled={isLoadingProjects}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder="Use token default" />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															<SelectItem value="">
																Use token default
															</SelectItem>
															{projects?.map((project) => (
																<SelectItem
																	key={project.slug}
																	value={project.slug}
																>
																	{project.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<FormDescription>
														Override the project from your service token
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>

										{selectedProject && (
											<FormField
												control={form.control}
												name="dopplerConfig"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Config (Optional)</FormLabel>
														<Select
															onValueChange={field.onChange}
															value={field.value}
															disabled={isLoadingConfigs}
														>
															<FormControl>
																<SelectTrigger>
																	<SelectValue placeholder="Use token default" />
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																<SelectItem value="">
																	Use token default
																</SelectItem>
																{configs?.map((config) => (
																	<SelectItem
																		key={config.name}
																		value={config.name}
																	>
																		{config.name} ({config.environment})
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<FormDescription>
															Override the config from your service token
														</FormDescription>
														<FormMessage />
													</FormItem>
												)}
											/>
										)}

										<FormField
											control={form.control}
											name="dopplerMergeStrategy"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Merge Strategy</FormLabel>
													<Select
														onValueChange={field.onChange}
														value={field.value}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															<SelectItem value="doppler_priority">
																Doppler Priority (Doppler overwrites manual)
															</SelectItem>
															<SelectItem value="manual_priority">
																Manual Priority (Manual overwrites Doppler)
															</SelectItem>
															<SelectItem value="doppler_only">
																Doppler Only (Ignore manual env vars)
															</SelectItem>
															<SelectItem value="manual_only">
																Manual Only (Ignore Doppler)
															</SelectItem>
														</SelectContent>
													</Select>
													<FormDescription>
														How to handle conflicts between manual and Doppler
														secrets
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>

										{secretPreview && (
											<AlertBlock type="info">
												<div className="flex items-center gap-2">
													<RefreshCw className="h-4 w-4" />
													<span>
														{secretPreview.count} secrets available from Doppler
													</span>
												</div>
											</AlertBlock>
										)}
									</>
								)}
							</>
						)}

						{data?.dopplerLastSyncAt && (
							<p className="text-sm text-muted-foreground">
								Last synced: {new Date(data.dopplerLastSyncAt).toLocaleString()}
							</p>
						)}

						<div className="flex justify-end">
							<Button type="submit" disabled={isSaving || !hasChanges}>
								{isSaving ? (
									<Loader2 className="h-4 w-4 animate-spin mr-2" />
								) : null}
								Save Doppler Settings
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
