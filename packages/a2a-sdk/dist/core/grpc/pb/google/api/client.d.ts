import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { Duration } from "../protobuf/duration.js";
import { LaunchStage } from "./launch_stage.js";
export declare const protobufPackage = "google.api";
/**
 * The organization for which the client libraries are being published.
 * Affects the url where generated docs are published, etc.
 */
export declare enum ClientLibraryOrganization {
    /** CLIENT_LIBRARY_ORGANIZATION_UNSPECIFIED - Not useful. */
    CLIENT_LIBRARY_ORGANIZATION_UNSPECIFIED = 0,
    /** CLOUD - Google Cloud Platform Org. */
    CLOUD = 1,
    /** ADS - Ads (Advertising) Org. */
    ADS = 2,
    /** PHOTOS - Photos Org. */
    PHOTOS = 3,
    /** STREET_VIEW - Street View Org. */
    STREET_VIEW = 4,
    /** SHOPPING - Shopping Org. */
    SHOPPING = 5,
    /** GEO - Geo Org. */
    GEO = 6,
    /** GENERATIVE_AI - Generative AI - https://developers.generativeai.google */
    GENERATIVE_AI = 7,
    UNRECOGNIZED = -1
}
/** To where should client libraries be published? */
export declare enum ClientLibraryDestination {
    /**
     * CLIENT_LIBRARY_DESTINATION_UNSPECIFIED - Client libraries will neither be generated nor published to package
     * managers.
     */
    CLIENT_LIBRARY_DESTINATION_UNSPECIFIED = 0,
    /**
     * GITHUB - Generate the client library in a repo under github.com/googleapis,
     * but don't publish it to package managers.
     */
    GITHUB = 10,
    /** PACKAGE_MANAGER - Publish the library to package managers like nuget.org and npmjs.com. */
    PACKAGE_MANAGER = 20,
    UNRECOGNIZED = -1
}
/** Required information for every language. */
export interface CommonLanguageSettings {
    /**
     * Link to automatically generated reference documentation.  Example:
     * https://cloud.google.com/nodejs/docs/reference/asset/latest
     *
     * @deprecated
     */
    referenceDocsUri: string;
    /** The destination where API teams want this client library to be published. */
    destinations: ClientLibraryDestination[];
    /** Configuration for which RPCs should be generated in the GAPIC client. */
    selectiveGapicGeneration: SelectiveGapicGeneration | undefined;
}
/** Details about how and where to publish client libraries. */
export interface ClientLibrarySettings {
    /**
     * Version of the API to apply these settings to. This is the full protobuf
     * package for the API, ending in the version element.
     * Examples: "google.cloud.speech.v1" and "google.spanner.admin.database.v1".
     */
    version: string;
    /** Launch stage of this version of the API. */
    launchStage: LaunchStage;
    /**
     * When using transport=rest, the client request will encode enums as
     * numbers rather than strings.
     */
    restNumericEnums: boolean;
    /** Settings for legacy Java features, supported in the Service YAML. */
    javaSettings: JavaSettings | undefined;
    /** Settings for C++ client libraries. */
    cppSettings: CppSettings | undefined;
    /** Settings for PHP client libraries. */
    phpSettings: PhpSettings | undefined;
    /** Settings for Python client libraries. */
    pythonSettings: PythonSettings | undefined;
    /** Settings for Node client libraries. */
    nodeSettings: NodeSettings | undefined;
    /** Settings for .NET client libraries. */
    dotnetSettings: DotnetSettings | undefined;
    /** Settings for Ruby client libraries. */
    rubySettings: RubySettings | undefined;
    /** Settings for Go client libraries. */
    goSettings: GoSettings | undefined;
}
/**
 * This message configures the settings for publishing [Google Cloud Client
 * libraries](https://cloud.google.com/apis/docs/cloud-client-libraries)
 * generated from the service config.
 */
export interface Publishing {
    /**
     * A list of API method settings, e.g. the behavior for methods that use the
     * long-running operation pattern.
     */
    methodSettings: MethodSettings[];
    /**
     * Link to a *public* URI where users can report issues.  Example:
     * https://issuetracker.google.com/issues/new?component=190865&template=1161103
     */
    newIssueUri: string;
    /**
     * Link to product home page.  Example:
     * https://cloud.google.com/asset-inventory/docs/overview
     */
    documentationUri: string;
    /**
     * Used as a tracking tag when collecting data about the APIs developer
     * relations artifacts like docs, packages delivered to package managers,
     * etc.  Example: "speech".
     */
    apiShortName: string;
    /** GitHub label to apply to issues and pull requests opened for this API. */
    githubLabel: string;
    /**
     * GitHub teams to be added to CODEOWNERS in the directory in GitHub
     * containing source code for the client libraries for this API.
     */
    codeownerGithubTeams: string[];
    /**
     * A prefix used in sample code when demarking regions to be included in
     * documentation.
     */
    docTagPrefix: string;
    /** For whom the client library is being published. */
    organization: ClientLibraryOrganization;
    /**
     * Client library settings.  If the same version string appears multiple
     * times in this list, then the last one wins.  Settings from earlier
     * settings with the same version string are discarded.
     */
    librarySettings: ClientLibrarySettings[];
    /**
     * Optional link to proto reference documentation.  Example:
     * https://cloud.google.com/pubsub/lite/docs/reference/rpc
     */
    protoReferenceDocumentationUri: string;
    /**
     * Optional link to REST reference documentation.  Example:
     * https://cloud.google.com/pubsub/lite/docs/reference/rest
     */
    restReferenceDocumentationUri: string;
}
/** Settings for Java client libraries. */
export interface JavaSettings {
    /**
     * The package name to use in Java. Clobbers the java_package option
     * set in the protobuf. This should be used **only** by APIs
     * who have already set the language_settings.java.package_name" field
     * in gapic.yaml. API teams should use the protobuf java_package option
     * where possible.
     *
     * Example of a YAML configuration::
     *
     *  publishing:
     *    java_settings:
     *      library_package: com.google.cloud.pubsub.v1
     */
    libraryPackage: string;
    /**
     * Configure the Java class name to use instead of the service's for its
     * corresponding generated GAPIC client. Keys are fully-qualified
     * service names as they appear in the protobuf (including the full
     * the language_settings.java.interface_names" field in gapic.yaml. API
     * teams should otherwise use the service name as it appears in the
     * protobuf.
     *
     * Example of a YAML configuration::
     *
     *  publishing:
     *    java_settings:
     *      service_class_names:
     *        - google.pubsub.v1.Publisher: TopicAdmin
     *        - google.pubsub.v1.Subscriber: SubscriptionAdmin
     */
    serviceClassNames: {
        [key: string]: string;
    };
    /** Some settings. */
    common: CommonLanguageSettings | undefined;
}
export interface JavaSettings_ServiceClassNamesEntry {
    key: string;
    value: string;
}
/** Settings for C++ client libraries. */
export interface CppSettings {
    /** Some settings. */
    common: CommonLanguageSettings | undefined;
}
/** Settings for Php client libraries. */
export interface PhpSettings {
    /** Some settings. */
    common: CommonLanguageSettings | undefined;
}
/** Settings for Python client libraries. */
export interface PythonSettings {
    /** Some settings. */
    common: CommonLanguageSettings | undefined;
    /** Experimental features to be included during client library generation. */
    experimentalFeatures: PythonSettings_ExperimentalFeatures | undefined;
}
/**
 * Experimental features to be included during client library generation.
 * These fields will be deprecated once the feature graduates and is enabled
 * by default.
 */
export interface PythonSettings_ExperimentalFeatures {
    /**
     * Enables generation of asynchronous REST clients if `rest` transport is
     * enabled. By default, asynchronous REST clients will not be generated.
     * This feature will be enabled by default 1 month after launching the
     * feature in preview packages.
     */
    restAsyncIoEnabled: boolean;
    /**
     * Enables generation of protobuf code using new types that are more
     * Pythonic which are included in `protobuf>=5.29.x`. This feature will be
     * enabled by default 1 month after launching the feature in preview
     * packages.
     */
    protobufPythonicTypesEnabled: boolean;
    /**
     * Disables generation of an unversioned Python package for this client
     * library. This means that the module names will need to be versioned in
     * import statements. For example `import google.cloud.library_v2` instead
     * of `import google.cloud.library`.
     */
    unversionedPackageDisabled: boolean;
}
/** Settings for Node client libraries. */
export interface NodeSettings {
    /** Some settings. */
    common: CommonLanguageSettings | undefined;
}
/** Settings for Dotnet client libraries. */
export interface DotnetSettings {
    /** Some settings. */
    common: CommonLanguageSettings | undefined;
    /**
     * Map from original service names to renamed versions.
     * This is used when the default generated types
     * would cause a naming conflict. (Neither name is
     * fully-qualified.)
     * Example: Subscriber to SubscriberServiceApi.
     */
    renamedServices: {
        [key: string]: string;
    };
    /**
     * Map from full resource types to the effective short name
     * for the resource. This is used when otherwise resource
     * named from different services would cause naming collisions.
     * Example entry:
     * "datalabeling.googleapis.com/Dataset": "DataLabelingDataset"
     */
    renamedResources: {
        [key: string]: string;
    };
    /**
     * List of full resource types to ignore during generation.
     * This is typically used for API-specific Location resources,
     * which should be handled by the generator as if they were actually
     * the common Location resources.
     * Example entry: "documentai.googleapis.com/Location"
     */
    ignoredResources: string[];
    /**
     * Namespaces which must be aliased in snippets due to
     * a known (but non-generator-predictable) naming collision
     */
    forcedNamespaceAliases: string[];
    /**
     * Method signatures (in the form "service.method(signature)")
     * which are provided separately, so shouldn't be generated.
     * Snippets *calling* these methods are still generated, however.
     */
    handwrittenSignatures: string[];
}
export interface DotnetSettings_RenamedServicesEntry {
    key: string;
    value: string;
}
export interface DotnetSettings_RenamedResourcesEntry {
    key: string;
    value: string;
}
/** Settings for Ruby client libraries. */
export interface RubySettings {
    /** Some settings. */
    common: CommonLanguageSettings | undefined;
}
/** Settings for Go client libraries. */
export interface GoSettings {
    /** Some settings. */
    common: CommonLanguageSettings | undefined;
    /**
     * Map of service names to renamed services. Keys are the package relative
     * service names and values are the name to be used for the service client
     * and call options.
     *
     * publishing:
     *   go_settings:
     *     renamed_services:
     *       Publisher: TopicAdmin
     */
    renamedServices: {
        [key: string]: string;
    };
}
export interface GoSettings_RenamedServicesEntry {
    key: string;
    value: string;
}
/** Describes the generator configuration for a method. */
export interface MethodSettings {
    /**
     * The fully qualified name of the method, for which the options below apply.
     * This is used to find the method to apply the options.
     *
     * Example:
     *
     *    publishing:
     *      method_settings:
     *      - selector: google.storage.control.v2.StorageControl.CreateFolder
     *        # method settings for CreateFolder...
     */
    selector: string;
    /**
     * Describes settings to use for long-running operations when generating
     * API methods for RPCs. Complements RPCs that use the annotations in
     * google/longrunning/operations.proto.
     *
     * Example of a YAML configuration::
     *
     *    publishing:
     *      method_settings:
     *      - selector: google.cloud.speech.v2.Speech.BatchRecognize
     *        long_running:
     *          initial_poll_delay: 60s # 1 minute
     *          poll_delay_multiplier: 1.5
     *          max_poll_delay: 360s # 6 minutes
     *          total_poll_timeout: 54000s # 90 minutes
     */
    longRunning: MethodSettings_LongRunning | undefined;
    /**
     * List of top-level fields of the request message, that should be
     * automatically populated by the client libraries based on their
     * (google.api.field_info).format. Currently supported format: UUID4.
     *
     * Example of a YAML configuration:
     *
     *    publishing:
     *      method_settings:
     *      - selector: google.example.v1.ExampleService.CreateExample
     *        auto_populated_fields:
     *        - request_id
     */
    autoPopulatedFields: string[];
}
/**
 * Describes settings to use when generating API methods that use the
 * long-running operation pattern.
 * All default values below are from those used in the client library
 * generators (e.g.
 * [Java](https://github.com/googleapis/gapic-generator-java/blob/04c2faa191a9b5a10b92392fe8482279c4404803/src/main/java/com/google/api/generator/gapic/composer/common/RetrySettingsComposer.java)).
 */
export interface MethodSettings_LongRunning {
    /**
     * Initial delay after which the first poll request will be made.
     * Default value: 5 seconds.
     */
    initialPollDelay: Duration | undefined;
    /**
     * Multiplier to gradually increase delay between subsequent polls until it
     * reaches max_poll_delay.
     * Default value: 1.5.
     */
    pollDelayMultiplier: number;
    /**
     * Maximum time between two subsequent poll requests.
     * Default value: 45 seconds.
     */
    maxPollDelay: Duration | undefined;
    /**
     * Total polling timeout.
     * Default value: 5 minutes.
     */
    totalPollTimeout: Duration | undefined;
}
/**
 * This message is used to configure the generation of a subset of the RPCs in
 * a service for client libraries.
 */
export interface SelectiveGapicGeneration {
    /**
     * An allowlist of the fully qualified names of RPCs that should be included
     * on public client surfaces.
     */
    methods: string[];
    /**
     * Setting this to true indicates to the client generators that methods
     * that would be excluded from the generation should instead be generated
     * in a way that indicates these methods should not be consumed by
     * end users. How this is expressed is up to individual language
     * implementations to decide. Some examples may be: added annotations,
     * obfuscated identifiers, or other language idiomatic patterns.
     */
    generateOmittedAsInternal: boolean;
}
export declare const CommonLanguageSettings: MessageFns<CommonLanguageSettings>;
export declare const ClientLibrarySettings: MessageFns<ClientLibrarySettings>;
export declare const Publishing: MessageFns<Publishing>;
export declare const JavaSettings: MessageFns<JavaSettings>;
export declare const JavaSettings_ServiceClassNamesEntry: MessageFns<JavaSettings_ServiceClassNamesEntry>;
export declare const CppSettings: MessageFns<CppSettings>;
export declare const PhpSettings: MessageFns<PhpSettings>;
export declare const PythonSettings: MessageFns<PythonSettings>;
export declare const PythonSettings_ExperimentalFeatures: MessageFns<PythonSettings_ExperimentalFeatures>;
export declare const NodeSettings: MessageFns<NodeSettings>;
export declare const DotnetSettings: MessageFns<DotnetSettings>;
export declare const DotnetSettings_RenamedServicesEntry: MessageFns<DotnetSettings_RenamedServicesEntry>;
export declare const DotnetSettings_RenamedResourcesEntry: MessageFns<DotnetSettings_RenamedResourcesEntry>;
export declare const RubySettings: MessageFns<RubySettings>;
export declare const GoSettings: MessageFns<GoSettings>;
export declare const GoSettings_RenamedServicesEntry: MessageFns<GoSettings_RenamedServicesEntry>;
export declare const MethodSettings: MessageFns<MethodSettings>;
export declare const MethodSettings_LongRunning: MessageFns<MethodSettings_LongRunning>;
export declare const SelectiveGapicGeneration: MessageFns<SelectiveGapicGeneration>;
export interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
}
//# sourceMappingURL=client.d.ts.map