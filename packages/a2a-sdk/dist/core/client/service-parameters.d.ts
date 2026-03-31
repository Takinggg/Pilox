import { Extensions } from '../extensions.js';
export type ServiceParameters = Record<string, string>;
export type ServiceParametersUpdate = (parameters: ServiceParameters) => void;
export declare const ServiceParameters: {
    create(...updates: ServiceParametersUpdate[]): ServiceParameters;
    createFrom: (serviceParameters: ServiceParameters | undefined, ...updates: ServiceParametersUpdate[]) => ServiceParameters;
};
export declare function withA2AExtensions(...extensions: Extensions): ServiceParametersUpdate;
//# sourceMappingURL=service-parameters.d.ts.map