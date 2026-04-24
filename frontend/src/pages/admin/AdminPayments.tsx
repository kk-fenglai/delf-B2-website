import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tabs, Table, Tag, Space, Button, Modal, Input, InputNumber, message, Typography, Select, Divider, Switch,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '../../api/adminClient';

const { Title } = Typography;

type Provider = 'wechat' | 'alipay';
type OrderStatus = 'CREATED' | 'PENDING' | 'PAID' | 'CLOSED' | 'REFUNDED' | 'FAILED';

interface ProductRow {
  id: string;
  code: string;
  name: string;
  plan: string;
  active: boolean;
  prices: Array<{
    id: string;
    code: string;
    months: number;
    currency: string;
    amountCents: number;
    supportsAutoRenew: boolean;
    active: boolean;
  }>;
}

interface PaymentOrderRow {
  id: string;
  userId: string;
  provider: Provider;
  product: string;
  plan: string;
  months: number;
  currency: string;
  amountCents: number;
  refundedCents: number;
  status: OrderStatus;
  providerOrderNo: string | null;
  externalTradeNo: string | null;
  createdAt: string;
  paidAt: string | null;
  user?: { id: string; email: string; name: string | null };
  price?: { code: string; months: number; amountCents: number } | null;
}

interface ContractRow {
  id: string;
  provider: Provider;
  status: 'PENDING' | 'ACTIVE' | 'TERMINATED' | 'SUSPENDED';
  externalContractId: string;
  nextChargeAt: string | null;
  lastChargeAt: string | null;
  failedCount: number;
  createdAt: string;
  user?: { id: string; email: string; name: string | null; plan: string };
  price?: { code: string; months: number; amountCents: number; product?: { code: string; name: string } } | null;
}

function formatYuan(cents: number) {
  if (cents % 100 === 0) return `¥${cents / 100}`;
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const statusColor: Record<OrderStatus, string> = {
  CREATED: 'default',
  PENDING: 'processing',
  PAID: 'success',
  CLOSED: 'default',
  REFUNDED: 'warning',
  FAILED: 'error',
};

const contractStatusColor: Record<ContractRow['status'], string> = {
  PENDING: 'default',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'default',
};

export default function AdminPayments() {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [orders, setOrders] = useState<PaymentOrderRow[] | null>(null);
  const [contracts, setContracts] = useState<ContractRow[] | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundOrder, setRefundOrder] = useState<PaymentOrderRow | null>(null);
  const [refundAmount, setRefundAmount] = useState<number | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const { data } = await adminApi.get('/products');
      setProducts(data.products || []);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const { data } = await adminApi.get('/payment-orders', { params: { page: 1, pageSize: 50 } });
      setOrders(data.orders || []);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const loadContracts = useCallback(async () => {
    const { data } = await adminApi.get('/contracts', { params: { page: 1, pageSize: 50 } });
    setContracts(data.contracts || []);
  }, []);

  useEffect(() => {
    Promise.allSettled([loadProducts(), loadOrders(), loadContracts()]).catch(() => {});
  }, [loadProducts, loadOrders, loadContracts]);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [productForm, setProductForm] = useState({ code: '', name: '', plan: 'STANDARD', active: true });

  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<{ id: string; productId: string } | null>(null);
  const [priceForm, setPriceForm] = useState({
    productId: '',
    code: '',
    months: 1,
    amountCents: 0,
    supportsAutoRenew: false,
    active: true,
  });

  function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
    const headers = Object.keys(rows[0] || {});
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      const needsQuote = /[",\n]/.test(s);
      const x = s.replace(/"/g, '""');
      return needsQuote ? `"${x}"` : x;
    };
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportOrdersCsv() {
    if (!orders || orders.length === 0) {
      message.info('没有可导出的订单');
      return;
    }
    const rows = orders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      userEmail: o.user?.email || '',
      userId: o.userId,
      provider: o.provider,
      product: o.product,
      plan: o.plan,
      months: o.months,
      amountCents: o.amountCents,
      refundedCents: o.refundedCents,
      status: o.status,
      providerOrderNo: o.providerOrderNo || '',
      externalTradeNo: o.externalTradeNo || '',
      paidAt: o.paidAt || '',
    }));
    downloadCsv(`payment-orders_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function openCreateProduct() {
    setEditingProduct(null);
    setProductForm({ code: '', name: '', plan: 'STANDARD', active: true });
    setProductModalOpen(true);
  }

  function openEditProduct(p: ProductRow) {
    setEditingProduct(p);
    setProductForm({ code: p.code, name: p.name, plan: p.plan, active: p.active });
    setProductModalOpen(true);
  }

  async function saveProduct() {
    if (!productForm.code.trim() || !productForm.name.trim()) {
      message.error('请填写 code 和名称');
      return;
    }
    setBusyId(editingProduct?.id || 'product');
    try {
      if (editingProduct) {
        await adminApi.patch(`/products/${editingProduct.id}`, {
          name: productForm.name,
          plan: productForm.plan,
          active: productForm.active,
        });
        message.success('已更新商品');
      } else {
        await adminApi.post('/products', {
          code: productForm.code.trim(),
          name: productForm.name.trim(),
          plan: productForm.plan,
          active: productForm.active,
        });
        message.success('已创建商品');
      }
      setProductModalOpen(false);
      await loadProducts();
    } catch (e: any) {
      message.error(e?.response?.data?.error || '保存失败');
    } finally {
      setBusyId(null);
    }
  }

  async function disableProduct(p: ProductRow) {
    setBusyId(p.id);
    try {
      await adminApi.delete(`/products/${p.id}`);
      message.success('已停用商品');
      await loadProducts();
    } catch (e: any) {
      message.error(e?.response?.data?.error || '操作失败');
    } finally {
      setBusyId(null);
    }
  }

  function openCreatePrice(productId: string) {
    setEditingPrice(null);
    setPriceForm({
      productId,
      code: '',
      months: 1,
      amountCents: 0,
      supportsAutoRenew: false,
      active: true,
    });
    setPriceModalOpen(true);
  }

  function openEditPrice(productId: string, price: ProductRow['prices'][number]) {
    setEditingPrice({ id: price.id, productId });
    setPriceForm({
      productId,
      code: price.code,
      months: price.months,
      amountCents: price.amountCents,
      supportsAutoRenew: price.supportsAutoRenew,
      active: price.active,
    });
    setPriceModalOpen(true);
  }

  async function savePrice() {
    if (!priceForm.productId) {
      message.error('缺少 productId');
      return;
    }
    if (!priceForm.code.trim()) {
      message.error('请填写价格 code');
      return;
    }
    if (!priceForm.months || priceForm.months < 1) {
      message.error('months 必须 >= 1');
      return;
    }
    if (priceForm.amountCents < 0) {
      message.error('金额不能为负数');
      return;
    }
    setBusyId(editingPrice?.id || 'price');
    try {
      if (editingPrice) {
        await adminApi.patch(`/prices/${editingPrice.id}`, {
          amountCents: priceForm.amountCents,
          supportsAutoRenew: priceForm.supportsAutoRenew,
          active: priceForm.active,
        });
        message.success('已更新价格档');
      } else {
        await adminApi.post('/prices', {
          productId: priceForm.productId,
          code: priceForm.code.trim(),
          months: priceForm.months,
          currency: 'CNY',
          amountCents: priceForm.amountCents,
          supportsAutoRenew: priceForm.supportsAutoRenew,
          active: priceForm.active,
        });
        message.success('已创建价格档');
      }
      setPriceModalOpen(false);
      await loadProducts();
    } catch (e: any) {
      message.error(e?.response?.data?.error || '保存失败');
    } finally {
      setBusyId(null);
    }
  }

  async function disablePrice(priceId: string) {
    setBusyId(priceId);
    try {
      await adminApi.delete(`/prices/${priceId}`);
      message.success('已停用价格档');
      await loadProducts();
    } catch (e: any) {
      message.error(e?.response?.data?.error || '操作失败');
    } finally {
      setBusyId(null);
    }
  }

  const orderColumns = useMemo<ColumnsType<PaymentOrderRow>>(() => [
    { title: '时间', dataIndex: 'createdAt', render: (v: string) => formatDate(v), width: 180 },
    { title: '用户', dataIndex: ['user', 'email'], render: (_v, row) => row.user?.email || row.userId, width: 220 },
    { title: '计划', dataIndex: 'plan', render: (v: string) => <Tag>{v}</Tag> },
    { title: '月数', dataIndex: 'months', width: 80 },
    {
      title: '金额',
      render: (_v, row) => (
        <span>
          {formatYuan(row.amountCents)}
          {row.refundedCents > 0 && (
            <span className="text-xs text-gray-500 ml-2">已退 {formatYuan(row.refundedCents)}</span>
          )}
        </span>
      ),
      width: 180,
    },
    { title: '渠道', dataIndex: 'provider', render: (v: Provider) => (v === 'wechat' ? '微信' : '支付宝'), width: 90 },
    { title: '状态', dataIndex: 'status', render: (v: OrderStatus) => <Tag color={statusColor[v]}>{v}</Tag>, width: 120 },
    { title: 'out_trade_no', dataIndex: 'providerOrderNo', render: (v: string | null) => v || '—', width: 220 },
    {
      title: '操作',
      render: (_v, row) => (
        <Space>
          <Button
            size="small"
            disabled={row.status !== 'PAID'}
            onClick={() => {
              setRefundOrder(row);
              setRefundAmount(null);
              setRefundReason('');
              setAdminPassword('');
              setRefundOpen(true);
            }}
          >
            退款
          </Button>
        </Space>
      ),
      width: 100,
      fixed: 'right',
    },
  ], []);

  const contractColumns = useMemo<ColumnsType<ContractRow>>(() => [
    { title: '创建时间', dataIndex: 'createdAt', render: (v: string) => formatDate(v), width: 180 },
    { title: '用户', dataIndex: ['user', 'email'], render: (_v, row) => row.user?.email || '—', width: 240 },
    { title: '渠道', dataIndex: 'provider', render: (v: Provider) => (v === 'wechat' ? '微信' : '支付宝'), width: 90 },
    { title: '状态', dataIndex: 'status', render: (v: ContractRow['status']) => <Tag color={contractStatusColor[v]}>{v}</Tag>, width: 120 },
    { title: '下次扣款', dataIndex: 'nextChargeAt', render: (v: string | null) => formatDate(v), width: 180 },
    { title: '失败次数', dataIndex: 'failedCount', width: 90 },
    { title: '外部合约号', dataIndex: 'externalContractId', width: 260 },
    {
      title: '操作',
      render: (_v, row) => (
        <Button
          size="small"
          danger
          loading={busyId === row.id}
          disabled={row.status === 'TERMINATED'}
          onClick={async () => {
            setBusyId(row.id);
            try {
              await adminApi.post(`/contracts/${row.id}/terminate`);
              message.success('已强制解约');
              await loadContracts();
            } catch (e: any) {
              message.error(e?.response?.data?.error || '解约失败');
            } finally {
              setBusyId(null);
            }
          }}
        >
          强制解约
        </Button>
      ),
      width: 120,
      fixed: 'right',
    },
  ], [busyId, loadContracts]);

  async function doRefund() {
    if (!refundOrder) return;
    if (!adminPassword) {
      message.error('需要二次确认密码（X-Admin-Password）');
      return;
    }
    setBusyId(refundOrder.id);
    try {
      const payload: any = {};
      if (refundAmount && refundAmount > 0) payload.amountCents = refundAmount;
      if (refundReason) payload.reason = refundReason;
      await adminApi.post(`/payment-orders/${refundOrder.id}/refund`, payload, {
        headers: { 'X-Admin-Password': adminPassword },
      });
      message.success('退款已提交');
      setRefundOpen(false);
      setRefundOrder(null);
      await loadOrders();
    } catch (e: any) {
      message.error(e?.response?.data?.error || '退款失败');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <Title level={3}>支付管理</Title>

      <Tabs
        items={[
          {
            key: 'catalog',
            label: '商品/价格',
            children: (
              <div className="text-sm">
                <Space style={{ marginBottom: 12 }}>
                  <Button type="primary" onClick={openCreateProduct}>新增商品</Button>
                  <Button onClick={loadProducts} loading={loadingProducts}>刷新</Button>
                </Space>
                <Table
                  rowKey="id"
                  loading={loadingProducts}
                  dataSource={products || []}
                  pagination={false}
                  columns={[
                    { title: 'code', dataIndex: 'code', width: 140 },
                    { title: '名称', dataIndex: 'name', width: 220 },
                    { title: 'plan', dataIndex: 'plan', width: 140 },
                    { title: 'active', dataIndex: 'active', render: (v: boolean) => (v ? <Tag color="green">ON</Tag> : <Tag>OFF</Tag>), width: 90 },
                    {
                      title: '价格档',
                      render: (_v, row: ProductRow) => (
                        <div>
                          <Space wrap>
                            {row.prices.map((p) => (
                              <Tag key={p.id}>
                                {p.code} · {p.months}m · {formatYuan(p.amountCents)} {p.supportsAutoRenew ? '·续费' : ''} {p.active ? '' : '·停用'}
                              </Tag>
                            ))}
                          </Space>
                          <Divider style={{ margin: '8px 0' }} />
                          <Space wrap>
                            <Button size="small" onClick={() => openCreatePrice(row.id)}>新增价格档</Button>
                            {row.prices.map((p) => (
                              <Space key={p.id}>
                                <Button size="small" onClick={() => openEditPrice(row.id, p)}>编辑 {p.code}</Button>
                                <Button size="small" danger disabled={!p.active} loading={busyId === p.id} onClick={() => disablePrice(p.id)}>
                                  停用
                                </Button>
                              </Space>
                            ))}
                          </Space>
                        </div>
                      ),
                    },
                    {
                      title: '操作',
                      width: 220,
                      render: (_v, row: ProductRow) => (
                        <Space>
                          <Button size="small" onClick={() => openEditProduct(row)}>编辑</Button>
                          <Button
                            size="small"
                            danger
                            disabled={!row.active}
                            loading={busyId === row.id}
                            onClick={() => disableProduct(row)}
                          >
                            停用
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'orders',
            label: '订单对账',
            children: (
              <div>
                <Space style={{ marginBottom: 12 }}>
                  <Button onClick={loadOrders} loading={loadingOrders}>刷新</Button>
                  <Button onClick={exportOrdersCsv} disabled={!orders || orders.length === 0}>导出 CSV（当前页）</Button>
                </Space>
                <Table
                  rowKey="id"
                  loading={loadingOrders}
                  dataSource={orders || []}
                  columns={orderColumns}
                  scroll={{ x: 1400 }}
                  pagination={{ pageSize: 20 }}
                />
              </div>
            ),
          },
          {
            key: 'contracts',
            label: '合约管理',
            children: (
              <Table
                rowKey="id"
                dataSource={contracts || []}
                columns={contractColumns}
                scroll={{ x: 1200 }}
                pagination={{ pageSize: 20 }}
              />
            ),
          },
        ]}
      />

      <Modal
        title="手动退款"
        open={refundOpen}
        onCancel={() => setRefundOpen(false)}
        onOk={doRefund}
        okButtonProps={{ loading: !!busyId }}
      >
        <div className="text-sm text-gray-600 mb-3">
          订单：{refundOrder?.id}
        </div>
        <Space direction="vertical" style={{ width: '100%' }}>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="退款金额（分，可选；不填 = 全额退剩余可退）"
            value={refundAmount ?? undefined}
            min={1}
            onChange={(v) => setRefundAmount(typeof v === 'number' ? v : null)}
          />
          <Input
            placeholder="退款原因（可选）"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          />
          <Input.Password
            placeholder="管理员密码二次确认（X-Admin-Password）"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
        </Space>
      </Modal>

      <Modal
        title={editingProduct ? '编辑商品' : '新增商品'}
        open={productModalOpen}
        onCancel={() => setProductModalOpen(false)}
        onOk={saveProduct}
        okButtonProps={{ loading: busyId === (editingProduct?.id || 'product') }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            placeholder="code（如 STANDARD / AI / AI_UNLIMITED）"
            value={productForm.code}
            disabled={!!editingProduct}
            onChange={(e) => setProductForm((s) => ({ ...s, code: e.target.value }))}
          />
          <Input
            placeholder="名称（展示用）"
            value={productForm.name}
            onChange={(e) => setProductForm((s) => ({ ...s, name: e.target.value }))}
          />
          <Select
            value={productForm.plan}
            onChange={(v) => setProductForm((s) => ({ ...s, plan: v }))}
            options={[
              { value: 'STANDARD', label: 'STANDARD' },
              { value: 'AI', label: 'AI' },
              { value: 'AI_UNLIMITED', label: 'AI_UNLIMITED' },
            ]}
          />
          <div className="flex items-center justify-between">
            <span>启用</span>
            <Switch checked={productForm.active} onChange={(v) => setProductForm((s) => ({ ...s, active: v }))} />
          </div>
        </Space>
      </Modal>

      <Modal
        title={editingPrice ? '编辑价格档' : '新增价格档'}
        open={priceModalOpen}
        onCancel={() => setPriceModalOpen(false)}
        onOk={savePrice}
        okButtonProps={{ loading: busyId === (editingPrice?.id || 'price') }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            placeholder="价格 code（如 STANDARD_1M）"
            value={priceForm.code}
            disabled={!!editingPrice}
            onChange={(e) => setPriceForm((s) => ({ ...s, code: e.target.value }))}
          />
          <InputNumber
            style={{ width: '100%' }}
            placeholder="months（如 1 / 12）"
            value={priceForm.months}
            disabled={!!editingPrice}
            min={1}
            onChange={(v) => setPriceForm((s) => ({ ...s, months: typeof v === 'number' ? v : 1 }))}
          />
          <InputNumber
            style={{ width: '100%' }}
            placeholder="amountCents（分）"
            value={priceForm.amountCents}
            min={0}
            onChange={(v) => setPriceForm((s) => ({ ...s, amountCents: typeof v === 'number' ? v : 0 }))}
          />
          <div className="flex items-center justify-between">
            <span>支持自动续费</span>
            <Switch
              checked={priceForm.supportsAutoRenew}
              onChange={(v) => setPriceForm((s) => ({ ...s, supportsAutoRenew: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <span>启用</span>
            <Switch checked={priceForm.active} onChange={(v) => setPriceForm((s) => ({ ...s, active: v }))} />
          </div>
        </Space>
      </Modal>
    </div>
  );
}

