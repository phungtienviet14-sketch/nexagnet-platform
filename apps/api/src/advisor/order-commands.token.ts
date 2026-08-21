/**
 * DI token cho `OrderCommandPort` — quyen GHI cua agent (huy don, sua don).
 *
 * Dung token thay vi tiem thang lop hien thuc, giong `ORDER_PARSER`: `AgentOrchestrator` khong can
 * biet kho don duoc hien thuc the nao, va quan trong hon — mot moi truong KHONG dang ky token nay
 * thi agent chi con quyen doc, khong phai vi ai do nho tat cong tac ma vi khong ai bat no.
 */
export const ORDER_COMMANDS = 'ORDER_COMMANDS';
