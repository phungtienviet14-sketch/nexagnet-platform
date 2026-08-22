# Bang chung POC Hatchet — chay that, 2026-08-22T08:50:46Z

## Ha tang do duoc
SERVICE             STATUS                    PORTS
hatchet-dashboard   Up 18 minutes             0.0.0.0:8744->80/tcp, [::]:8744->80/tcp
hatchet-engine      Up 18 minutes             0.0.0.0:7744->7070/tcp, [::]:7744->7070/tcp
postgres            Up 18 minutes (healthy)   0.0.0.0:5744->5432/tcp, [::]:5744->5432/tcp

NAME                        CPU %     MEM USAGE / LIMIT
pocwf-hatchet-dashboard-1   0.51%     27.44MiB / 7.562GiB
pocwf-hatchet-engine-1      1.99%     40.38MiB / 7.562GiB
pocwf-postgres-1            8.75%     280.7MiB / 7.562GiB

## Diem cuoi ngoai — so lan goi THAT theo khoa idempotency
attemptsByKey = {
 "tenant-alpha:PROOF-OK-1": 1,
 "tenant-alpha:PROOF-RETRY-1": 3,
 "tenant-alpha:PROOF-CRASH-1": 1,
 "tenant-alpha:PROOF-CANCEL-1": 2,
 "tenant-alpha:PROOF-VER-1": 1
}
appliedKeys   = [
 "tenant-alpha:PROOF-OK-1",
 "tenant-alpha:PROOF-RETRY-1",
 "tenant-alpha:PROOF-CRASH-1",
 "tenant-alpha:PROOF-CANCEL-1",
 "tenant-alpha:PROOF-VER-1"
]

## Nhat ky diem cuoi (co traceparent)
[endpoint] {"at":"2026-08-22T08:41:40.984Z","mode":"ok","key":"tenant-alpha:PROOF-OK-1","attempt":1,"traceparent":"00-dc2034f8ba0be3c71bcbdafb551eceff-323fb613753aa317-01"}
[endpoint] {"at":"2026-08-22T08:43:00.595Z","mode":"fail_then_ok","key":"tenant-alpha:PROOF-RETRY-1","attempt":1,"traceparent":"00-5e7bd7c5ea220b48b36cb3e37bf66209-cefebfef9b5d9ef2-01"}
[endpoint] {"at":"2026-08-22T08:43:03.129Z","mode":"fail_then_ok","key":"tenant-alpha:PROOF-RETRY-1","attempt":2,"traceparent":"00-5e7bd7c5ea220b48b36cb3e37bf66209-cefebfef9b5d9ef2-01"}
[endpoint] {"at":"2026-08-22T08:43:11.398Z","mode":"fail_then_ok","key":"tenant-alpha:PROOF-RETRY-1","attempt":3,"traceparent":"00-5e7bd7c5ea220b48b36cb3e37bf66209-cefebfef9b5d9ef2-01"}
[endpoint] {"at":"2026-08-22T08:44:05.417Z","mode":"ok","key":"tenant-alpha:PROOF-CRASH-1","attempt":1,"traceparent":"00-ae4fb4a1d15736e20d21d17238d185e4-5c254a08f5391277-01"}
[endpoint] {"at":"2026-08-22T08:45:31.386Z","mode":"ok","key":"tenant-alpha:PROOF-CANCEL-1","attempt":1,"traceparent":"00-faf3a86b0a3108536d3e186de2b60581-8ddd0002d8c938f5-01"}
[endpoint] {"at":"2026-08-22T08:46:07.451Z","mode":"ok","key":"tenant-alpha:PROOF-CANCEL-1","attempt":2,"traceparent":"00-faf3a86b0a3108536d3e186de2b60581-8ddd0002d8c938f5-01"}
[endpoint] {"at":"2026-08-22T08:46:52.189Z","mode":"ok","key":"tenant-alpha:PROOF-VER-1","attempt":1,"traceparent":"00-ada1b0107df75cdc85e464efb00f92a5-e7ecdc20fdb55c08-01"}

## Nhat ky worker V1 (truoc khi bi giet)
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 validate/aa85db48-8004-4cc3-b9ad-ab032d266cc0 
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/ctx] validate ok tenant=tenant-alpha version=v1
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 validate/aa85db48-8004-4cc3-b9ad-ab032d266cc0 
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 map/4b5cd42a-f9cd-496b-8c64-8438b47c2527 
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/ctx] map -> /erp/orders (che: phone,address)
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 map/4b5cd42a-f9cd-496b-8c64-8438b47c2527 
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 dispatch/7892a774-83ef-43be-8bae-7e94172d8819 
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/ctx] dispatch attempt=1 key=tenant-alpha:PROOF-OK-1 mode=ok
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/ctx] dispatch ok attempt=1 externalRef=EXT-tenant-alpha:PROOF-OK-1
🪓 24044 | 08/22/26, 03:41:40 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 dispatch/7892a774-83ef-43be-8bae-7e94172d8819 
🪓 24044 | 08/22/26, 03:41:41 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 await-approval/36f34ca6-3f62-4d56-839c-d633d9f66dbf 
🪓 24044 | 08/22/26, 03:41:41 PM  [INFO/ctx] cho duyet toi da 15s — su kien 'automation-proof:approved'
🪓 24044 | 08/22/26, 03:41:56 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 await-approval/36f34ca6-3f62-4d56-839c-d633d9f66dbf 
🪓 24044 | 08/22/26, 03:41:56 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 finalize/5457b41e-2140-4c4b-adca-5a9c1391e4be 
🪓 24044 | 08/22/26, 03:41:56 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 finalize/5457b41e-2140-4c4b-adca-5a9c1391e4be 
🪓 24044 | 08/22/26, 03:42:56 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 validate/d8a0cc0a-3dc8-41c8-8165-5040c49c2c0e 
🪓 24044 | 08/22/26, 03:42:56 PM  [ERROR/Worker/poc-worker-v1] Task run failed: PAYLOAD_INVALID: customer,totalQuantity 	 validate/d8a0cc0a-3dc8-41c8-8165-5040c49c2c0e 
🪓 24044 | 08/22/26, 03:43:00 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 validate/3bdeee6f-b58e-4e17-af3c-23e30f2022d8 
🪓 24044 | 08/22/26, 03:43:00 PM  [INFO/ctx] validate ok tenant=tenant-alpha version=v1
🪓 24044 | 08/22/26, 03:43:00 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 validate/3bdeee6f-b58e-4e17-af3c-23e30f2022d8 
🪓 24044 | 08/22/26, 03:43:00 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 map/d7831334-80f4-4d9e-822b-082f55cd990e 
🪓 24044 | 08/22/26, 03:43:00 PM  [INFO/ctx] map -> /erp/orders (che: phone,address)
🪓 24044 | 08/22/26, 03:43:00 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 map/d7831334-80f4-4d9e-822b-082f55cd990e 
🪓 24044 | 08/22/26, 03:43:00 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 dispatch/63ffbcf8-b804-4955-b273-6ccdcc9c4a1c 
🪓 24044 | 08/22/26, 03:43:00 PM  [INFO/ctx] dispatch attempt=1 key=tenant-alpha:PROOF-RETRY-1 mode=fail_then_ok
🪓 24044 | 08/22/26, 03:43:00 PM  [ERROR/Worker/poc-worker-v1] Task run failed: UPSTREAM_UNAVAILABLE (status=500, attempt=1) 	 dispatch/63ffbcf8-b804-4955-b273-6ccdcc9c4a1c 
🪓 24044 | 08/22/26, 03:43:03 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 dispatch/63ffbcf8-b804-4955-b273-6ccdcc9c4a1c 
🪓 24044 | 08/22/26, 03:43:03 PM  [INFO/ctx] dispatch attempt=2 key=tenant-alpha:PROOF-RETRY-1 mode=fail_then_ok
🪓 24044 | 08/22/26, 03:43:03 PM  [ERROR/Worker/poc-worker-v1] Task run failed: UPSTREAM_UNAVAILABLE (status=500, attempt=2) 	 dispatch/63ffbcf8-b804-4955-b273-6ccdcc9c4a1c 
🪓 24044 | 08/22/26, 03:43:11 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 dispatch/63ffbcf8-b804-4955-b273-6ccdcc9c4a1c 
🪓 24044 | 08/22/26, 03:43:11 PM  [INFO/ctx] dispatch attempt=3 key=tenant-alpha:PROOF-RETRY-1 mode=fail_then_ok
🪓 24044 | 08/22/26, 03:43:11 PM  [INFO/ctx] dispatch ok attempt=3 externalRef=EXT-tenant-alpha:PROOF-RETRY-1
🪓 24044 | 08/22/26, 03:43:11 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 dispatch/63ffbcf8-b804-4955-b273-6ccdcc9c4a1c 
🪓 24044 | 08/22/26, 03:43:11 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 await-approval/26ce9e7c-99d4-4389-9e61-1eef2fc76083 
🪓 24044 | 08/22/26, 03:43:11 PM  [INFO/ctx] cho duyet toi da 5s — su kien 'automation-proof:approved'
🪓 24044 | 08/22/26, 03:43:16 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 await-approval/26ce9e7c-99d4-4389-9e61-1eef2fc76083 
🪓 24044 | 08/22/26, 03:43:16 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 finalize/11a874be-460d-4a5a-973d-bfd5c0e0c3c4 
🪓 24044 | 08/22/26, 03:43:16 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 finalize/11a874be-460d-4a5a-973d-bfd5c0e0c3c4 
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 validate/cfecac01-fb0c-41e9-b40d-8514be79949f 
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/ctx] validate ok tenant=tenant-alpha version=v1
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 validate/cfecac01-fb0c-41e9-b40d-8514be79949f 
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 map/7bdf5a5f-465c-4e9d-9db2-6a3b29feb263 
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/ctx] map -> /erp/orders (che: phone,address)
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 map/7bdf5a5f-465c-4e9d-9db2-6a3b29feb263 
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 dispatch/29704b21-8699-4638-8663-9a7311c33f08 
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/ctx] dispatch attempt=1 key=tenant-alpha:PROOF-CRASH-1 mode=ok
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/ctx] dispatch ok attempt=1 externalRef=EXT-tenant-alpha:PROOF-CRASH-1
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 dispatch/29704b21-8699-4638-8663-9a7311c33f08 
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 await-approval/e87da969-8a75-4fe2-bf58-ec67b4b89123 
🪓 24044 | 08/22/26, 03:44:05 PM  [INFO/ctx] cho duyet toi da 120s — su kien 'automation-proof:approved'

## Nhat ky worker V1 (sau khi khoi dong lai)
[worker] khoi dong version=v1 slots=5 pid=21968
🪓 21968 | 08/22/26, 03:44:47 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 await-approval/e87da969-8a75-4fe2-bf58-ec67b4b89123 
🪓 21968 | 08/22/26, 03:44:47 PM  [INFO/ctx] cho duyet toi da 120s — su kien 'automation-proof:approved'
🪓 21968 | 08/22/26, 03:44:48 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 await-approval/e87da969-8a75-4fe2-bf58-ec67b4b89123 
🪓 21968 | 08/22/26, 03:44:48 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 finalize/f2019af1-a461-4a82-a5cc-40d218a947f2 
🪓 21968 | 08/22/26, 03:44:48 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 finalize/f2019af1-a461-4a82-a5cc-40d218a947f2 
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 validate/07635aea-6490-47f0-9a83-b346d9668c2b 
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/ctx] validate ok tenant=tenant-alpha version=v1
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 validate/07635aea-6490-47f0-9a83-b346d9668c2b 
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 map/ecad09bf-f723-4dea-ae53-7ab17a0f7ef2 
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/ctx] map -> /erp/orders (che: phone,address)
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 map/ecad09bf-f723-4dea-ae53-7ab17a0f7ef2 
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 dispatch/c6171a91-0df0-4567-b8da-9e555f6dfca5 
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/ctx] dispatch attempt=1 key=tenant-alpha:PROOF-CANCEL-1 mode=ok
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/ctx] dispatch ok attempt=1 externalRef=EXT-tenant-alpha:PROOF-CANCEL-1
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 dispatch/c6171a91-0df0-4567-b8da-9e555f6dfca5 
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 await-approval/50f52fec-d9a6-4d1b-970e-a47d9a355acd 
🪓 21968 | 08/22/26, 03:45:31 PM  [INFO/ctx] cho duyet toi da 300s — su kien 'automation-proof:approved'
🪓 21968 | 08/22/26, 03:45:38 PM  [INFO/Worker/poc-worker-v1] Task run cancelling... 	 await-approval/50f52fec-d9a6-4d1b-970e-a47d9a355acd 
🪓 21968 | 08/22/26, 03:45:38 PM  [INFO/Worker/poc-worker-v1] Task run cancelled 	 await-approval/50f52fec-d9a6-4d1b-970e-a47d9a355acd 
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 validate/07635aea-6490-47f0-9a83-b346d9668c2b 
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/ctx] validate ok tenant=tenant-alpha version=v1
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 validate/07635aea-6490-47f0-9a83-b346d9668c2b 
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 map/ecad09bf-f723-4dea-ae53-7ab17a0f7ef2 
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/ctx] map -> /erp/orders (che: phone,address)
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 map/ecad09bf-f723-4dea-ae53-7ab17a0f7ef2 
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 dispatch/c6171a91-0df0-4567-b8da-9e555f6dfca5 
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/ctx] dispatch attempt=2 key=tenant-alpha:PROOF-CANCEL-1 mode=ok
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/ctx] dispatch ok attempt=2 externalRef=EXT-tenant-alpha:PROOF-CANCEL-1
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 dispatch/c6171a91-0df0-4567-b8da-9e555f6dfca5 
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 await-approval/50f52fec-d9a6-4d1b-970e-a47d9a355acd 
🪓 21968 | 08/22/26, 03:46:07 PM  [INFO/ctx] cho duyet toi da 300s — su kien 'automation-proof:approved'
🪓 21968 | 08/22/26, 03:46:19 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 validate/d8a0cc0a-3dc8-41c8-8165-5040c49c2c0e 
🪓 21968 | 08/22/26, 03:46:19 PM  [ERROR/Worker/poc-worker-v1] Task run failed: PAYLOAD_INVALID: customer,totalQuantity 	 validate/d8a0cc0a-3dc8-41c8-8165-5040c49c2c0e 
🪓 21968 | 08/22/26, 03:46:51 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 validate/82b6d250-75c3-4405-a141-44667b81aef6 
🪓 21968 | 08/22/26, 03:46:51 PM  [INFO/ctx] validate ok tenant=tenant-alpha version=v1
🪓 21968 | 08/22/26, 03:46:51 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 validate/82b6d250-75c3-4405-a141-44667b81aef6 
🪓 21968 | 08/22/26, 03:46:52 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 map/cf69f9d3-f27f-457b-8811-04d3aa363d51 
🪓 21968 | 08/22/26, 03:46:52 PM  [INFO/ctx] map -> /erp/orders (che: phone,address)
🪓 21968 | 08/22/26, 03:46:52 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 map/cf69f9d3-f27f-457b-8811-04d3aa363d51 
🪓 21968 | 08/22/26, 03:46:52 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 dispatch/097bb0a7-66be-4dff-9c65-33543b866c3a 
🪓 21968 | 08/22/26, 03:46:52 PM  [INFO/ctx] dispatch attempt=1 key=tenant-alpha:PROOF-VER-1 mode=ok
🪓 21968 | 08/22/26, 03:46:52 PM  [INFO/ctx] dispatch ok attempt=1 externalRef=EXT-tenant-alpha:PROOF-VER-1
🪓 21968 | 08/22/26, 03:46:52 PM  [INFO/Worker/poc-worker-v1] Task run completed 	 dispatch/097bb0a7-66be-4dff-9c65-33543b866c3a 
🪓 21968 | 08/22/26, 03:46:52 PM  [INFO/Worker/poc-worker-v1] Task run starting... 	 await-approval/44943cf3-f802-4744-aa9f-7553c2b2d40c 
🪓 21968 | 08/22/26, 03:46:52 PM  [INFO/ctx] cho duyet toi da 300s — su kien 'automation-proof:approved'

## Nhat ky worker V2
[worker] khoi dong version=v2 slots=5 pid=5364
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/Worker/poc-worker-v2] Task run starting... 	 await-approval/44943cf3-f802-4744-aa9f-7553c2b2d40c 
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/Worker/poc-worker-v2] Task run starting... 	 await-approval/50f52fec-d9a6-4d1b-970e-a47d9a355acd 
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/ctx] cho duyet toi da 300s — su kien 'automation-proof:approved'
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/ctx] cho duyet toi da 300s — su kien 'automation-proof:approved'
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/Worker/poc-worker-v2] Task run completed 	 await-approval/50f52fec-d9a6-4d1b-970e-a47d9a355acd 
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/Worker/poc-worker-v2] Task run completed 	 await-approval/44943cf3-f802-4744-aa9f-7553c2b2d40c 
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/Worker/poc-worker-v2] Task run starting... 	 finalize/8201ffb7-eec1-4e4f-924d-fb5ff7957b2d 
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/Worker/poc-worker-v2] Task run completed 	 finalize/8201ffb7-eec1-4e4f-924d-fb5ff7957b2d 
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/Worker/poc-worker-v2] Task run starting... 	 finalize/eb80ce45-dfdc-4224-8608-ee06ae3c2008 
🪓 5364 | 08/22/26, 03:47:36 PM  [INFO/Worker/poc-worker-v2] Task run completed 	 finalize/eb80ce45-dfdc-4224-8608-ee06ae3c2008 
