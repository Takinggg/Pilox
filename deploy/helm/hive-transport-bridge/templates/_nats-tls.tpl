{{/*
  Call: include "hive-transport-bridge.natsTlsVolume" (dict "root" $ "component" "bridge")
*/}}
{{- define "hive-transport-bridge.natsTlsVolume" -}}
{{- $root := .root -}}
{{- $c := .component -}}
{{- $v := index $root.Values $c -}}
{{- if and $v.natsTls.enabled $v.natsTls.secretName -}}
- name: nats-tls
  secret:
    secretName: {{ $v.natsTls.secretName | quote }}
    defaultMode: 0400
{{- end -}}
{{- end }}

{{- define "hive-transport-bridge.natsTlsVolumeMount" -}}
{{- $root := .root -}}
{{- $c := .component -}}
{{- $v := index $root.Values $c -}}
{{- if and $v.natsTls.enabled $v.natsTls.secretName -}}
- name: nats-tls
  mountPath: {{ $v.natsTls.mountPath | quote }}
  readOnly: true
{{- end -}}
{{- end }}

{{- define "hive-transport-bridge.natsTlsEnv" -}}
{{- $root := .root -}}
{{- $c := .component -}}
{{- $prefix := ternary "SUBSCRIBER" "BRIDGE" (eq $c "subscriber") -}}
{{- $v := index $root.Values $c -}}
{{- if and $v.natsTls.enabled $v.natsTls.secretName -}}
{{- $mp := $v.natsTls.mountPath -}}
- name: {{ $prefix }}_NATS_TLS
  value: "1"
{{- if $v.natsTls.caFilename }}
- name: {{ $prefix }}_NATS_TLS_CA_FILE
  value: {{ printf "%s/%s" $mp $v.natsTls.caFilename | quote }}
{{- end }}
{{- if $v.natsTls.certFilename }}
- name: {{ $prefix }}_NATS_TLS_CERT_FILE
  value: {{ printf "%s/%s" $mp $v.natsTls.certFilename | quote }}
{{- end }}
{{- if $v.natsTls.keyFilename }}
- name: {{ $prefix }}_NATS_TLS_KEY_FILE
  value: {{ printf "%s/%s" $mp $v.natsTls.keyFilename | quote }}
{{- end }}
{{- if $v.natsTls.insecureSkipVerify }}
- name: {{ $prefix }}_NATS_TLS_REJECT_UNAUTHORIZED
  value: "0"
{{- end }}
{{- end -}}
{{- end }}
