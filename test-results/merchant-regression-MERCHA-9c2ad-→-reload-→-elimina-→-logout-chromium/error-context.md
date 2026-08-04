# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: merchant-regression.spec.ts >> MERCHANT REGRESSION TEST (DB-synced + build-fixed) >> MERCHANT REGRESSION: login → dashboard → wizard ×3 → editor → 13 moduli → media → reload → elimina → logout
- Location: tests\merchant-regression.spec.ts:53:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Degustazione E2E"
Received: undefined
```

# Page snapshot

```yaml
- generic [active] [ref=f24e1]:
  - main [ref=f24e2]:
    - generic [ref=f24e5]:
      - generic [ref=f24e6]:
        - link "Home" [ref=f24e7] [cursor=pointer]:
          - /url: /
        - generic [ref=f24e11]:
          - link "Area Commerciante" [ref=f24e12] [cursor=pointer]:
            - /url: /merchant
          - paragraph [ref=f24e13]: Area Commerciante
      - generic [ref=f24e14]:
        - generic [ref=f24e15]: commerciante-b.test@localhub.it
        - button "Esci" [ref=f24e17]
    - generic [ref=f24e21]:
      - complementary [ref=f24e22]:
        - generic [ref=f24e23]:
          - paragraph [ref=f24e24]: Navigazione
          - link "La mia area" [ref=f24e26] [cursor=pointer]:
            - /url: /merchant
        - generic [ref=f24e30]:
          - paragraph [ref=f24e31]: I tuoi negozi
          - generic [ref=f24e32]:
            - link "Negozio QA Commerciante B Bar" [ref=f24e33] [cursor=pointer]:
              - /url: /merchant/7bc172a9-7a9b-43ca-b4cc-9d5a47790dd3
              - generic [ref=f24e34]: Negozio QA Commerciante B
              - generic [ref=f24e35]: Bar
            - link "Negozio Rinominato 1785764115160 Bar" [ref=f24e36] [cursor=pointer]:
              - /url: /merchant/b5c531b2-3f0d-4a8e-a1b2-11c82d1eec3d
              - generic [ref=f24e37]: Negozio Rinominato 1785764115160
              - generic [ref=f24e38]: Bar
            - link "E2E Duplicato 1785764115160 Bar" [ref=f24e39] [cursor=pointer]:
              - /url: /merchant/c6998716-68bb-4250-9e10-640c1fc2aec6
              - generic [ref=f24e40]: E2E Duplicato 1785764115160
              - generic [ref=f24e41]: Bar
            - link "E2E Template 1785764115160 Bar" [ref=f24e42] [cursor=pointer]:
              - /url: /merchant/149e4b92-4f36-4612-a6ab-25838dfd6b7b
              - generic [ref=f24e43]: E2E Template 1785764115160
              - generic [ref=f24e44]: Bar
            - link "Negozio Rinominato 1785764256856 Bar" [ref=f24e45] [cursor=pointer]:
              - /url: /merchant/03358431-dc90-4d95-81c4-917b9a31d116
              - generic [ref=f24e46]: Negozio Rinominato 1785764256856
              - generic [ref=f24e47]: Bar
            - link "E2E Duplicato 1785764256856 Bar" [ref=f24e48] [cursor=pointer]:
              - /url: /merchant/e111634e-6eb4-4051-a5ad-6c613ed0dcd1
              - generic [ref=f24e49]: E2E Duplicato 1785764256856
              - generic [ref=f24e50]: Bar
            - link "E2E Template 1785764256856 Bar" [ref=f24e51] [cursor=pointer]:
              - /url: /merchant/a5766853-69fa-4844-9c33-10e817339060
              - generic [ref=f24e52]: E2E Template 1785764256856
              - generic [ref=f24e53]: Bar
            - link "Negozio Rinominato 1785764525042 Bar" [ref=f24e54] [cursor=pointer]:
              - /url: /merchant/c6a7255b-7108-4eb1-a43d-156042aa61b4
              - generic [ref=f24e55]: Negozio Rinominato 1785764525042
              - generic [ref=f24e56]: Bar
            - link "E2E Duplicato 1785764525042 Bar" [ref=f24e57] [cursor=pointer]:
              - /url: /merchant/ce3c07f0-6841-43ec-b0d9-8ecdfb610f44
              - generic [ref=f24e58]: E2E Duplicato 1785764525042
              - generic [ref=f24e59]: Bar
            - link "E2E Template 1785764525042 Bar" [ref=f24e60] [cursor=pointer]:
              - /url: /merchant/7234a9f6-3bc9-4116-8c71-191cbb29193b
              - generic [ref=f24e61]: E2E Template 1785764525042
              - generic [ref=f24e62]: Bar
            - link "Negozio Rinominato 1785764627856 Bar" [ref=f24e63] [cursor=pointer]:
              - /url: /merchant/06a79fd7-e6b2-4eeb-80b4-dd84c5a2accc
              - generic [ref=f24e64]: Negozio Rinominato 1785764627856
              - generic [ref=f24e65]: Bar
            - link "E2E Duplicato 1785764627856 Bar" [ref=f24e66] [cursor=pointer]:
              - /url: /merchant/da4714b7-1ebb-4858-8dc1-1f501475bd43
              - generic [ref=f24e67]: E2E Duplicato 1785764627856
              - generic [ref=f24e68]: Bar
            - link "E2E Template 1785764627856 Bar" [ref=f24e69] [cursor=pointer]:
              - /url: /merchant/ef74e50f-3488-49ee-a15f-3f23f9588ebd
              - generic [ref=f24e70]: E2E Template 1785764627856
              - generic [ref=f24e71]: Bar
            - link "Negozio Rinominato 1785846000138 Bar" [ref=f24e72] [cursor=pointer]:
              - /url: /merchant/cc8b8399-f60e-4a97-a12d-f28b9361e892
              - generic [ref=f24e73]: Negozio Rinominato 1785846000138
              - generic [ref=f24e74]: Bar
            - link "E2E Duplicato 1785846000138 Bar" [ref=f24e75] [cursor=pointer]:
              - /url: /merchant/451961f2-22ba-4bf6-84bb-b789a6cf8a82
              - generic [ref=f24e76]: E2E Duplicato 1785846000138
              - generic [ref=f24e77]: Bar
            - link "E2E Template 1785846000138 Bar" [ref=f24e78] [cursor=pointer]:
              - /url: /merchant/6ad98b6e-6e92-4c74-b912-ebdcea66f300
              - generic [ref=f24e79]: E2E Template 1785846000138
              - generic [ref=f24e80]: Bar
            - link "Negozio Rinominato 1785846112931 Bar" [ref=f24e81] [cursor=pointer]:
              - /url: /merchant/e7570274-cb62-4aa4-9375-7633ae1903d7
              - generic [ref=f24e82]: Negozio Rinominato 1785846112931
              - generic [ref=f24e83]: Bar
            - link "E2E Duplicato 1785846112931 Bar" [ref=f24e84] [cursor=pointer]:
              - /url: /merchant/3a198989-28ee-4a5c-8f5a-65ae15265b1c
              - generic [ref=f24e85]: E2E Duplicato 1785846112931
              - generic [ref=f24e86]: Bar
            - link "E2E Template 1785846112931 Bar" [ref=f24e87] [cursor=pointer]:
              - /url: /merchant/e69a01e9-0dd9-4e37-b430-469f4525d151
              - generic [ref=f24e88]: E2E Template 1785846112931
              - generic [ref=f24e89]: Bar
            - link "Negozio Rinominato 1785852836225 Bar" [ref=f24e90] [cursor=pointer]:
              - /url: /merchant/e6d2e13f-5c4e-4530-8eb5-9ce0cbee1f04
              - generic [ref=f24e91]: Negozio Rinominato 1785852836225
              - generic [ref=f24e92]: Bar
            - link "E2E Duplicato 1785852836225 Bar" [ref=f24e93] [cursor=pointer]:
              - /url: /merchant/9715473a-c318-42ac-90f5-e29ddba4528c
              - generic [ref=f24e94]: E2E Duplicato 1785852836225
              - generic [ref=f24e95]: Bar
            - link "E2E Template 1785852836225 Bar" [ref=f24e96] [cursor=pointer]:
              - /url: /merchant/85171669-ee5f-4a1a-b108-9aafa35dd3d6
              - generic [ref=f24e97]: E2E Template 1785852836225
              - generic [ref=f24e98]: Bar
            - link "Negozio Rinominato 1785852924485 Bar" [ref=f24e99] [cursor=pointer]:
              - /url: /merchant/cc40cdcc-55df-4303-adc4-37001892b085
              - generic [ref=f24e100]: Negozio Rinominato 1785852924485
              - generic [ref=f24e101]: Bar
            - link "E2E Template 1785852924485 Bar" [ref=f24e102] [cursor=pointer]:
              - /url: /merchant/cf5e42bd-9089-4ed8-8ee4-5c62a5575235
              - generic [ref=f24e103]: E2E Template 1785852924485
              - generic [ref=f24e104]: Bar
            - link "Negozio Rinominato 1785853046152 Bar" [ref=f24e105] [cursor=pointer]:
              - /url: /merchant/4b3fd7ab-d27b-4316-a68e-a44a0a78c906
              - generic [ref=f24e106]: Negozio Rinominato 1785853046152
              - generic [ref=f24e107]: Bar
            - link "E2E Template 1785853046152 Bar" [ref=f24e108] [cursor=pointer]:
              - /url: /merchant/8832866a-f28f-4586-b368-8845e83ebe97
              - generic [ref=f24e109]: E2E Template 1785853046152
              - generic [ref=f24e110]: Bar
            - link "Negozio Rinominato 1785853830905 Bar" [ref=f24e111] [cursor=pointer]:
              - /url: /merchant/0ba5c01e-838a-402f-ba63-942ae70d2d36
              - generic [ref=f24e112]: Negozio Rinominato 1785853830905
              - generic [ref=f24e113]: Bar
            - link "E2E Duplicato 1785853830905 Bar" [ref=f24e114] [cursor=pointer]:
              - /url: /merchant/b6bf75f3-b4af-49ef-8749-aef8d517b14a
              - generic [ref=f24e115]: E2E Duplicato 1785853830905
              - generic [ref=f24e116]: Bar
            - link "E2E Template 1785853830905 Bar" [ref=f24e117] [cursor=pointer]:
              - /url: /merchant/a8290226-44ca-418a-b9e2-3441db778ac6
              - generic [ref=f24e118]: E2E Template 1785853830905
              - generic [ref=f24e119]: Bar
            - link "Negozio Rinominato 1785853919772 Bar" [ref=f24e120] [cursor=pointer]:
              - /url: /merchant/b3d2d88e-44d1-4c85-b5fd-04cede273ffc
              - generic [ref=f24e121]: Negozio Rinominato 1785853919772
              - generic [ref=f24e122]: Bar
            - link "E2E Duplicato 1785853919772 Bar" [ref=f24e123] [cursor=pointer]:
              - /url: /merchant/76d3942e-3e41-42e4-8b0d-7b59e535039c
              - generic [ref=f24e124]: E2E Duplicato 1785853919772
              - generic [ref=f24e125]: Bar
            - link "E2E Template 1785853919772 Bar" [ref=f24e126] [cursor=pointer]:
              - /url: /merchant/a6b8a014-17d7-4e6e-9bdf-33dd4d953e34
              - generic [ref=f24e127]: E2E Template 1785853919772
              - generic [ref=f24e128]: Bar
            - link "Negozio Rinominato 1785853981363 Bar" [ref=f24e129] [cursor=pointer]:
              - /url: /merchant/1c7610df-eed0-42cb-9ad4-d5d7cc0a0b0b
              - generic [ref=f24e130]: Negozio Rinominato 1785853981363
              - generic [ref=f24e131]: Bar
            - link "E2E Duplicato 1785853981363 Bar" [ref=f24e132] [cursor=pointer]:
              - /url: /merchant/32c138a0-d71c-4517-ac98-e51215517aa6
              - generic [ref=f24e133]: E2E Duplicato 1785853981363
              - generic [ref=f24e134]: Bar
            - link "E2E Template 1785853981363 Bar" [ref=f24e135] [cursor=pointer]:
              - /url: /merchant/2fbef551-eb43-4f1b-b55e-602fea218aea
              - generic [ref=f24e136]: E2E Template 1785853981363
              - generic [ref=f24e137]: Bar
            - link "Negozio Rinominato 1785854085556 Bar" [ref=f24e138] [cursor=pointer]:
              - /url: /merchant/30f5a2d8-99e5-478a-993d-3d00dceef71f
              - generic [ref=f24e139]: Negozio Rinominato 1785854085556
              - generic [ref=f24e140]: Bar
            - link "E2E Duplicato 1785854085556 Bar" [ref=f24e141] [cursor=pointer]:
              - /url: /merchant/44abf669-103b-46ea-80cc-0d2b7ed57e30
              - generic [ref=f24e142]: E2E Duplicato 1785854085556
              - generic [ref=f24e143]: Bar
            - link "E2E Template 1785854085556 Bar" [ref=f24e144] [cursor=pointer]:
              - /url: /merchant/0ec6a58c-5949-4464-92ed-ce96e571c899
              - generic [ref=f24e145]: E2E Template 1785854085556
              - generic [ref=f24e146]: Bar
            - link "Negozio Rinominato 1785854623461 Bar" [ref=f24e147] [cursor=pointer]:
              - /url: /merchant/365f5e9e-c5e2-4ae5-b500-037d498013dd
              - generic [ref=f24e148]: Negozio Rinominato 1785854623461
              - generic [ref=f24e149]: Bar
            - link "E2E Duplicato 1785854623461 Bar" [ref=f24e150] [cursor=pointer]:
              - /url: /merchant/8de26546-57cb-419a-85d8-d6e3092b4601
              - generic [ref=f24e151]: E2E Duplicato 1785854623461
              - generic [ref=f24e152]: Bar
            - link "E2E Template 1785854623461 Bar" [ref=f24e153] [cursor=pointer]:
              - /url: /merchant/2cb8e6bf-3985-4784-96a4-1b45dc495666
              - generic [ref=f24e154]: E2E Template 1785854623461
              - generic [ref=f24e155]: Bar
            - link "Negozio Rinominato 1785859719433 Bar" [ref=f24e156] [cursor=pointer]:
              - /url: /merchant/2700d6fe-a167-45c7-8edd-d0dacf1f9697
              - generic [ref=f24e157]: Negozio Rinominato 1785859719433
              - generic [ref=f24e158]: Bar
            - link "E2E Duplicato 1785859719433 Bar" [ref=f24e159] [cursor=pointer]:
              - /url: /merchant/c8691699-9fb1-4dcf-94aa-8c5478d063b4
              - generic [ref=f24e160]: E2E Duplicato 1785859719433
              - generic [ref=f24e161]: Bar
            - link "E2E Template 1785859719433 Bar" [ref=f24e162] [cursor=pointer]:
              - /url: /merchant/b8ba3c4f-18f4-4fe5-b7c1-1eed8532cde1
              - generic [ref=f24e163]: E2E Template 1785859719433
              - generic [ref=f24e164]: Bar
            - link "Negozio Rinominato 1785859810802 Bar" [ref=f24e165] [cursor=pointer]:
              - /url: /merchant/5a409dca-cb94-4331-a842-474ac4a1e980
              - generic [ref=f24e166]: Negozio Rinominato 1785859810802
              - generic [ref=f24e167]: Bar
            - link "E2E Duplicato 1785859810802 Bar" [ref=f24e168] [cursor=pointer]:
              - /url: /merchant/f0c54530-c3f8-47e6-91b0-1c506d636e7f
              - generic [ref=f24e169]: E2E Duplicato 1785859810802
              - generic [ref=f24e170]: Bar
            - link "E2E Template 1785859810802 Bar" [ref=f24e171] [cursor=pointer]:
              - /url: /merchant/a68933f9-81c0-4b3e-acab-89f25df8da46
              - generic [ref=f24e172]: E2E Template 1785859810802
              - generic [ref=f24e173]: Bar
            - link "Negozio Rinominato 1785859935250 Bar" [ref=f24e174] [cursor=pointer]:
              - /url: /merchant/cb6b6eaf-61d9-4d88-bc83-2a924d6ea393
              - generic [ref=f24e175]: Negozio Rinominato 1785859935250
              - generic [ref=f24e176]: Bar
            - link "E2E Duplicato 1785859935250 Bar" [ref=f24e177] [cursor=pointer]:
              - /url: /merchant/51c3756f-68b7-4e25-8a94-752e1874eb94
              - generic [ref=f24e178]: E2E Duplicato 1785859935250
              - generic [ref=f24e179]: Bar
            - link "E2E Template 1785859935250 Bar" [ref=f24e180] [cursor=pointer]:
              - /url: /merchant/1ec05f48-0321-4ea7-99d9-67fbee79e399
              - generic [ref=f24e181]: E2E Template 1785859935250
              - generic [ref=f24e182]: Bar
            - link "Negozio Rinominato 1785860068696 Bar" [ref=f24e183] [cursor=pointer]:
              - /url: /merchant/8df86959-3a52-4e4a-9fdc-172236c61391
              - generic [ref=f24e184]: Negozio Rinominato 1785860068696
              - generic [ref=f24e185]: Bar
            - link "E2E Duplicato 1785860068696 Bar" [ref=f24e186] [cursor=pointer]:
              - /url: /merchant/f2c47ebe-1320-4751-b810-2fc382734099
              - generic [ref=f24e187]: E2E Duplicato 1785860068696
              - generic [ref=f24e188]: Bar
            - link "E2E Template 1785860068696 Bar" [ref=f24e189] [cursor=pointer]:
              - /url: /merchant/f540b92c-524b-461b-94e5-f551682185db
              - generic [ref=f24e190]: E2E Template 1785860068696
              - generic [ref=f24e191]: Bar
            - link "Negozio Rinominato 1785865355892 Bar" [ref=f24e192] [cursor=pointer]:
              - /url: /merchant/9c6acac8-a8f0-4f39-b3b4-6dca14ebc034
              - generic [ref=f24e193]: Negozio Rinominato 1785865355892
              - generic [ref=f24e194]: Bar
            - link "E2E Duplicato 1785865355892 Bar" [ref=f24e195] [cursor=pointer]:
              - /url: /merchant/0c4b6841-f851-45cc-8ccf-adf833ec1434
              - generic [ref=f24e196]: E2E Duplicato 1785865355892
              - generic [ref=f24e197]: Bar
            - link "E2E Template 1785865355892 Bar" [ref=f24e198] [cursor=pointer]:
              - /url: /merchant/4024b31a-1746-4ef5-8f0b-0f0dada89558
              - generic [ref=f24e199]: E2E Template 1785865355892
              - generic [ref=f24e200]: Bar
            - link "Negozio Rinominato 1785865470361 Bar" [ref=f24e201] [cursor=pointer]:
              - /url: /merchant/79aa1d49-dd6e-4e88-a584-3c65f3b5d368
              - generic [ref=f24e202]: Negozio Rinominato 1785865470361
              - generic [ref=f24e203]: Bar
            - link "E2E Duplicato 1785865470361 Bar" [ref=f24e204] [cursor=pointer]:
              - /url: /merchant/a4017b1f-ae6d-41b0-9b51-81f2d183dd20
              - generic [ref=f24e205]: E2E Duplicato 1785865470361
              - generic [ref=f24e206]: Bar
            - link "E2E Template 1785865470361 Bar" [ref=f24e207] [cursor=pointer]:
              - /url: /merchant/5b689191-9c4c-4578-a678-67e6ce6743f5
              - generic [ref=f24e208]: E2E Template 1785865470361
              - generic [ref=f24e209]: Bar
            - link "Negozio Rinominato 1785866152405 Bar" [ref=f24e210] [cursor=pointer]:
              - /url: /merchant/a9804b38-b411-49de-89f8-2739d10d46eb
              - generic [ref=f24e211]: Negozio Rinominato 1785866152405
              - generic [ref=f24e212]: Bar
            - link "E2E Duplicato 1785866152405 Bar" [ref=f24e213] [cursor=pointer]:
              - /url: /merchant/6aa22024-7abd-4b02-89bf-110e51286b61
              - generic [ref=f24e214]: E2E Duplicato 1785866152405
              - generic [ref=f24e215]: Bar
            - link "E2E Template 1785866152405 Bar" [ref=f24e216] [cursor=pointer]:
              - /url: /merchant/ac71b849-c185-4d7f-a339-fa1974151f5f
              - generic [ref=f24e217]: E2E Template 1785866152405
              - generic [ref=f24e218]: Bar
            - link "Negozio Rinominato 1785870639886 Bar" [ref=f24e219] [cursor=pointer]:
              - /url: /merchant/590b907a-ae63-45ca-ab87-76364aabd3e1
              - generic [ref=f24e220]: Negozio Rinominato 1785870639886
              - generic [ref=f24e221]: Bar
            - link "E2E Duplicato 1785870639886 Bar" [ref=f24e222] [cursor=pointer]:
              - /url: /merchant/fbcbc1cb-211b-4697-8260-2868eb871e62
              - generic [ref=f24e223]: E2E Duplicato 1785870639886
              - generic [ref=f24e224]: Bar
            - link "E2E Template 1785870639886 Bar" [ref=f24e225] [cursor=pointer]:
              - /url: /merchant/067c56e4-e6ac-4ddc-80e4-7ccfb480c1e3
              - generic [ref=f24e226]: E2E Template 1785870639886
              - generic [ref=f24e227]: Bar
            - link "Negozio Rinominato 1785871251593 Bar" [ref=f24e228] [cursor=pointer]:
              - /url: /merchant/80088ecb-689b-49cc-b5a2-0e516d67543e
              - generic [ref=f24e229]: Negozio Rinominato 1785871251593
              - generic [ref=f24e230]: Bar
            - link "E2E Duplicato 1785871251593 Bar" [ref=f24e231] [cursor=pointer]:
              - /url: /merchant/7af8b142-f1c0-4c3c-99a4-1dc58f9d5908
              - generic [ref=f24e232]: E2E Duplicato 1785871251593
              - generic [ref=f24e233]: Bar
            - link "E2E Template 1785871251593 Bar" [ref=f24e234] [cursor=pointer]:
              - /url: /merchant/ff0e5ce0-1a6f-4940-a017-709561495a4c
              - generic [ref=f24e235]: E2E Template 1785871251593
              - generic [ref=f24e236]: Bar
            - link "Negozio Rinominato 1785871554189 Bar" [ref=f24e237] [cursor=pointer]:
              - /url: /merchant/0740eb4d-1750-4616-a34e-32bd23728906
              - generic [ref=f24e238]: Negozio Rinominato 1785871554189
              - generic [ref=f24e239]: Bar
            - link "E2E Duplicato 1785871554189 Bar" [ref=f24e240] [cursor=pointer]:
              - /url: /merchant/bbad0945-743f-4d11-8d33-e7dc8f16ec25
              - generic [ref=f24e241]: E2E Duplicato 1785871554189
              - generic [ref=f24e242]: Bar
            - link "E2E Template 1785871554189 Bar" [ref=f24e243] [cursor=pointer]:
              - /url: /merchant/031fcdb0-90d0-4354-8050-68e9b1ac23ac
              - generic [ref=f24e244]: E2E Template 1785871554189
              - generic [ref=f24e245]: Bar
            - link "Negozio Rinominato 1785872471187 Bar" [ref=f24e246] [cursor=pointer]:
              - /url: /merchant/9e0183fa-41a8-4c10-af79-e02bb598b5ca
              - generic [ref=f24e247]: Negozio Rinominato 1785872471187
              - generic [ref=f24e248]: Bar
            - link "E2E Duplicato 1785872471187 Bar" [ref=f24e249] [cursor=pointer]:
              - /url: /merchant/d61b4ea1-95b7-4781-8992-b4c4830340bc
              - generic [ref=f24e250]: E2E Duplicato 1785872471187
              - generic [ref=f24e251]: Bar
            - link "E2E Template 1785872471187 Bar" [ref=f24e252] [cursor=pointer]:
              - /url: /merchant/0143a7ac-fc1f-4de9-bb97-9fdea8b69a3b
              - generic [ref=f24e253]: E2E Template 1785872471187
              - generic [ref=f24e254]: Bar
            - link "Negozio Rinominato 1785877595148 Bar" [ref=f24e255] [cursor=pointer]:
              - /url: /merchant/fc2d0429-c9a1-4a63-a603-b9b1a8a18c88
              - generic [ref=f24e256]: Negozio Rinominato 1785877595148
              - generic [ref=f24e257]: Bar
            - link "E2E Duplicato 1785877595148 Bar" [ref=f24e258] [cursor=pointer]:
              - /url: /merchant/9963d864-9ccb-4a53-8bbe-049f34f14438
              - generic [ref=f24e259]: E2E Duplicato 1785877595148
              - generic [ref=f24e260]: Bar
            - link "E2E Template 1785877595148 Bar" [ref=f24e261] [cursor=pointer]:
              - /url: /merchant/fb859740-8516-4bc0-aaad-93785e87041b
              - generic [ref=f24e262]: E2E Template 1785877595148
              - generic [ref=f24e263]: Bar
            - link "Negozio Rinominato 1785877760581 Bar" [ref=f24e264] [cursor=pointer]:
              - /url: /merchant/039365c4-a110-4675-b410-34e247299a5c
              - generic [ref=f24e265]: Negozio Rinominato 1785877760581
              - generic [ref=f24e266]: Bar
            - link "E2E Duplicato 1785877760581 Bar" [ref=f24e267] [cursor=pointer]:
              - /url: /merchant/a1a8ef6e-845b-4cfe-8f9d-af7c9e5fdfa0
              - generic [ref=f24e268]: E2E Duplicato 1785877760581
              - generic [ref=f24e269]: Bar
            - link "E2E Template 1785877760581 Bar" [ref=f24e270] [cursor=pointer]:
              - /url: /merchant/e8a90720-a7fe-4c1a-bd2a-5268ffe4e9ad
              - generic [ref=f24e271]: E2E Template 1785877760581
              - generic [ref=f24e272]: Bar
            - link "Negozio Rinominato 1785880412464 Bar" [ref=f24e273] [cursor=pointer]:
              - /url: /merchant/ef49e3b4-38af-414a-ba12-6bcfcb7659f2
              - generic [ref=f24e274]: Negozio Rinominato 1785880412464
              - generic [ref=f24e275]: Bar
            - link "E2E Duplicato 1785880412464 Bar" [ref=f24e276] [cursor=pointer]:
              - /url: /merchant/01cc4c39-a94e-4d0f-b9e0-9f5bdf8c5c2f
              - generic [ref=f24e277]: E2E Duplicato 1785880412464
              - generic [ref=f24e278]: Bar
            - link "E2E Template 1785880412464 Bar" [ref=f24e279] [cursor=pointer]:
              - /url: /merchant/8a684920-72d8-42be-ab02-c356453ae0c4
              - generic [ref=f24e280]: E2E Template 1785880412464
              - generic [ref=f24e281]: Bar
            - link "Negozio Rinominato 1785880525262 Bar" [ref=f24e282] [cursor=pointer]:
              - /url: /merchant/7fb0d359-37a8-4ec0-886d-6993ec0a317c
              - generic [ref=f24e283]: Negozio Rinominato 1785880525262
              - generic [ref=f24e284]: Bar
            - link "E2E Duplicato 1785880525262 Bar" [ref=f24e285] [cursor=pointer]:
              - /url: /merchant/13982eea-4977-4ed8-b4af-a34e168f74bf
              - generic [ref=f24e286]: E2E Duplicato 1785880525262
              - generic [ref=f24e287]: Bar
            - link "E2E Template 1785880525262 Bar" [ref=f24e288] [cursor=pointer]:
              - /url: /merchant/2bab8f4e-e6bb-4833-8bc6-df6ee832d39c
              - generic [ref=f24e289]: E2E Template 1785880525262
              - generic [ref=f24e290]: Bar
            - link "Negozio Rinominato 1785880771587 Bar" [ref=f24e291] [cursor=pointer]:
              - /url: /merchant/7ad20381-a494-494a-a9d5-aea4a510fe2d
              - generic [ref=f24e292]: Negozio Rinominato 1785880771587
              - generic [ref=f24e293]: Bar
            - link "E2E Duplicato 1785880771587 Bar" [ref=f24e294] [cursor=pointer]:
              - /url: /merchant/775c07d1-00af-4f05-a4c1-e73969cae945
              - generic [ref=f24e295]: E2E Duplicato 1785880771587
              - generic [ref=f24e296]: Bar
            - link "E2E Template 1785880771587 Bar" [ref=f24e297] [cursor=pointer]:
              - /url: /merchant/f4f75cb5-a0dd-4883-8d2c-ecc7fa1d4c2a
              - generic [ref=f24e298]: E2E Template 1785880771587
              - generic [ref=f24e299]: Bar
      - generic [ref=f24e301]:
        - complementary [ref=f24e302]:
          - navigation [ref=f24e303]:
            - generic [ref=f24e304]:
              - button "Dashboard" [ref=f24e305]
              - link "Libreria Media" [ref=f24e311] [cursor=pointer]:
                - /url: /merchant/7ad20381-a494-494a-a9d5-aea4a510fe2d/media
              - generic [ref=f24e316]:
                - button "Dati Base ✓" [ref=f24e317]:
                  - generic [ref=f24e322]: Dati Base
                  - generic [ref=f24e323]: ✓
                - generic [ref=f24e326]:
                  - button "Informazioni ✓" [ref=f24e327]:
                    - generic [ref=f24e332]: Informazioni
                    - generic [ref=f24e333]: ✓
                  - button "Immagini ✓" [ref=f24e335]:
                    - generic [ref=f24e340]: Immagini
                    - generic [ref=f24e341]: ✓
                  - button "Contatti ✓" [ref=f24e343]:
                    - generic [ref=f24e346]: Contatti
                    - generic [ref=f24e347]: ✓
                  - button "Posizione ✓" [ref=f24e349]:
                    - generic [ref=f24e353]: Posizione
                    - generic [ref=f24e354]: ✓
                  - button "Orari ✓" [ref=f24e356]:
                    - generic [ref=f24e360]: Orari
                    - generic [ref=f24e361]: ✓
              - generic [ref=f24e363]:
                - button "Catalogo" [ref=f24e364]
                - generic [ref=f24e372]:
                  - button "Prodotti" [ref=f24e373]
                  - button "Servizi 1 ✓" [ref=f24e379]:
                    - generic [ref=f24e383]: Servizi
                    - generic [ref=f24e384]:
                      - generic [ref=f24e385]: "1"
                      - generic [ref=f24e386]: ✓
                  - button "Offerte 1 ✓" [ref=f24e387]:
                    - generic [ref=f24e391]: Offerte
                    - generic [ref=f24e392]:
                      - generic [ref=f24e393]: "1"
                      - generic [ref=f24e394]: ✓
                  - button "Eventi" [ref=f24e395]
              - button "Online ✓" [ref=f24e400]:
                - generic [ref=f24e403]: Online
                - generic [ref=f24e404]: ✓
              - button "Altro ✓" [ref=f24e408]:
                - generic [ref=f24e412]: Altro
                - generic [ref=f24e413]: ✓
              - button "Manutenzione" [ref=f24e418]
        - main [ref=f24e425]:
          - generic [ref=f24e426]:
            - generic [ref=f24e427]:
              - generic [ref=f24e428]:
                - img "Logo" [ref=f24e430]
                - button "Cambia logo" [ref=f24e431]
                - generic [ref=f24e435]:
                  - generic [ref=f24e436]:
                    - textbox "Nome negozio" [ref=f24e438]: Negozio Rinominato 1785880771587
                    - generic [ref=f24e439]: Bozza
                  - paragraph [ref=f24e441]: Bar
                  - paragraph [ref=f24e442]: "Ultimo aggiornamento: 5 agosto 2026 alle ore 00:00"
                  - generic [ref=f24e443]:
                    - link "Anteprima negozio" [ref=f24e444] [cursor=pointer]:
                      - /url: /negozio/e2e-panificio-1785880771587
                    - button "Anteprima inline" [ref=f24e445]
                    - button "Applica Template" [ref=f24e446]
              - generic [ref=f24e450]:
                - paragraph [ref=f24e451]: Completezza profilo
                - paragraph [ref=f24e452]: 85%
            - generic [ref=f24e455]:
              - heading "Azioni rapide" [level=2] [ref=f24e456]
              - generic [ref=f24e457]:
                - button "Aggiungi prodotto" [ref=f24e458]
                - button "Modifica immagini" [ref=f24e463]
  - contentinfo [ref=f24e468]: © 2026 InCittà · Castrovillari
  - button "Apri l'Assistente AI" [ref=f24e469]:
    - generic [ref=f24e473]: AI
  - button "Open Next.js Dev Tools" [ref=f24e479] [cursor=pointer]
  - alert [ref=f24e483]
```

# Test source

```ts
  365 |     await test.step("17. SEO", async () => {
  366 |       if (!storeId) { test.skip(true, "requires a store"); return; }
  367 |       log("Step 17: SEO");
  368 |       await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=seo`, { waitUntil: "domcontentloaded" });
  369 |       await expect(page.locator("body")).toContainText("SEO");
  370 |       await page.locator('input[placeholder="Titolo per i motori di ricerca"]').fill("Negozio E2E | LocalHub");
  371 |       await page.locator("textarea").fill("Descrizione SEO di test per il negozio E2E");
  372 |       const kw = page.getByPlaceholder("Digita una keyword SEO e premi Invio...");
  373 |       await kw.fill("pasticceria");
  374 |       await kw.press("Enter");
  375 |       await expect(page.locator("body")).toContainText("pasticceria");
  376 |       await saveModule(storeId);
  377 |     });
  378 | 
  379 |     /* ── 18. AI ───────────────────────────────────────────────────────────── */
  380 |     await test.step("18. AI", async () => {
  381 |       if (!storeId) { test.skip(true, "requires a store"); return; }
  382 |       log("Step 18: AI");
  383 |       await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=ai`, { waitUntil: "domcontentloaded" });
  384 |       await expect(page.locator("body")).toContainText("Assistente AI");
  385 |       await page.locator("textarea").fill("Rispondi sempre in italiano e sii gentile.");
  386 |       await page.locator("select").selectOption("amichevole");
  387 |       const faq = page.getByPlaceholder("Domanda frequente (es. Fate consegne a domicilio?)");
  388 |       await faq.fill("Fate consegne a domicilio?");
  389 |       await faq.press("Enter");
  390 |       await expect(page.locator("body")).toContainText("Fate consegne a domicilio?");
  391 |       await saveModule(storeId);
  392 |     });
  393 | 
  394 |     /* ── 19. Media (copertina + galleria) ─────────────────────────────────── */
  395 |     await test.step("19. Media", async () => {
  396 |       if (!storeId) { test.skip(true, "requires a store"); return; }
  397 |       log("Step 19: Media (copertina + galleria)");
  398 |       await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=immagini`, { waitUntil: "domcontentloaded" });
  399 |       await expect(page.locator("body")).toContainText("Immagini");
  400 |       const galleryPosts: string[] = [];
  401 |       page.on("response", (r) => {
  402 |         if (r.url().includes(`/api/merchant/stores/${storeId}/gallery`) && r.request().method() === "POST") {
  403 |           galleryPosts.push(r.url());
  404 |         }
  405 |       });
  406 |       const inputs = page.locator('input[type="file"]');
  407 |       await inputs.nth(1).setInputFiles("fixtures/logo-test.png"); // copertina
  408 |       await expect.poll(() => galleryPosts.length, { timeout: 20000 }).toBe(1);
  409 |       await inputs.nth(2).setInputFiles("fixtures/logo-test.png"); // galleria
  410 |       await expect.poll(() => galleryPosts.length, { timeout: 20000 }).toBe(2);
  411 |       // both uploads also trigger a settings PUT; verify galleria persisted
  412 |       await expect
  413 |         .poll(
  414 |           async () => {
  415 |             const j = await page.evaluate(
  416 |               async (u) => (await fetch(u)).json(),
  417 |               `/api/merchant/stores/${storeId}/settings`
  418 |             );
  419 |             return (j.data?.settings?.galleria ?? []).length;
  420 |           },
  421 |           { timeout: 20000 }
  422 |         )
  423 |         .toBeGreaterThanOrEqual(1);
  424 |       await expect(page.locator("body")).toContainText("Immagini");
  425 |     });
  426 | 
  427 |     /* ── 20. Reload + verifica persistenza (API) ──────────────────────────── */
  428 |     await test.step("20. Reload + persistenza", async () => {
  429 |       if (!storeId) { test.skip(true, "requires a store"); return; }
  430 |       log("Step 20: Reload + verifica persistenza");
  431 |       await page.goto(`${BASE}/merchant/${storeId}/edit`, { waitUntil: "domcontentloaded" });
  432 |       await expect(page).toHaveURL(/\/merchant\/[^/]+\/edit/);
  433 |       await page.reload({ waitUntil: "domcontentloaded" });
  434 |       await expect(page.locator("body")).toContainText("Completezza profilo");
  435 |       // fetch the settings API directly (avoids the reload-destroys-response race)
  436 |       const s = await page.evaluate(
  437 |         async (u) => {
  438 |           const r = await fetch(u);
  439 |           const j = await r.json();
  440 |           return j.data.settings as {
  441 |             nome: string;
  442 |             descrizione: string;
  443 |             servizi: string[];
  444 |             data?: {
  445 |               offerte?: Array<{ titolo?: string }>;
  446 |               eventi?: Array<{ titolo?: string }>;
  447 |               ai_data?: { tono?: string };
  448 |             };
  449 |             telefono?: string;
  450 |             indirizzo?: string;
  451 |             citta?: string;
  452 |             orari?: Record<string, { apertura1?: string }>;
  453 |             facebook?: string;
  454 |             seo_title?: string;
  455 |             logo_url?: string;
  456 |             galleria?: string[];
  457 |           };
  458 |         },
  459 |         `/api/merchant/stores/${storeId}/settings`
  460 |       );
  461 |       expect(s.nome).toMatch(/Rinominato/);
  462 |       expect(s.descrizione).toMatch(/Descrizione aggiornata/);
  463 |       expect(Array.isArray(s.servizi) && s.servizi.includes("Consegna a domicilio"), "servizi persisted").toBe(true);
  464 |       expect(s.data?.offerte?.[0]?.titolo).toBe("Sconto E2E");
> 465 |       expect(s.data?.eventi?.[0]?.titolo).toBe("Degustazione E2E");
      |                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  466 |       expect(s.data?.ai_data?.tono).toBe("amichevole");
  467 |       expect(s.telefono).toBe("0981 123456");
  468 |       expect(s.indirizzo).toBe("Via Roma 1");
  469 |       expect(s.citta).toBe("Castrovillari");
  470 |       expect(s.orari?.["lunedì"]?.apertura1).toBe("08:00");
  471 |       expect(s.facebook).toBe("negozio-e2e");
  472 |       expect(s.seo_title).toBe("Negozio E2E | LocalHub");
  473 |       expect(s.logo_url).toBeTruthy();
  474 |       expect(Array.isArray(s.galleria) && s.galleria.length >= 1).toBe(true);
  475 |       log(`persistenza OK — storeId=${storeId}`);
  476 |     });
  477 | 
  478 |     /* ── 21. Elimina (negozio duplicato) ──────────────────────────────────── */
  479 |     // RIMOSSO: l'eliminazione negozio è ora esclusiva dell'Area Amministratore.
  480 |     // Il commerciante non può più accedere alla Zona Pericolosa.
  481 | 
  482 |     /* ── 22. Logout ───────────────────────────────────────────────────────── */
  483 |     await test.step("22. Logout", async () => {
  484 |       log("Step 22: Logout");
  485 |       await page.goto(`${BASE}/merchant`, { waitUntil: "domcontentloaded" });
  486 |       await page.locator('form[action="/api/auth/signout"] button[type="submit"]').first().click();
  487 |       await page.waitForURL(`${BASE}/login`, { timeout: 15000 });
  488 |       await expect(page).toHaveURL(/\/login/);
  489 |       // reload after logout → session is gone, still on login
  490 |       await page.reload({ waitUntil: "domcontentloaded" });
  491 |       await expect(page).toHaveURL(/\/login/);
  492 |     });
  493 |   });
  494 | });
  495 | 
```