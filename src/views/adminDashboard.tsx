import React from 'react';
import View from './view';
import { useNavigate } from 'react-router-dom';
import NotFound from './notFound';
import Button from '../components/button';
import { pizzaService } from '../service/service';
import { Franchise, FranchiseList, Role, Store, User, UserList } from '../service/pizzaService';
import { TrashIcon } from '../icons';

interface Props {
  user: User | null;
}

export default function AdminDashboard(props: Props) {
  const navigate = useNavigate();
  const [franchiseList, setFranchiseList] = React.useState<FranchiseList>({ franchises: [], more: false });
  const [franchisePage, setFranchisePage] = React.useState(0);
  const filterFranchiseRef = React.useRef<HTMLInputElement>(null);
  const [userList, setUserList] = React.useState<UserList>({ users: [], more: false });
  const [userQuery, setUserQuery] = React.useState({ page: 1, nameFilter: '*' });
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [usersError, setUsersError] = React.useState('');
  const filterUserRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!Role.isRole(props.user, Role.Admin)) return;

    let active = true;
    setUsersLoading(true);
    setUsersError('');
    (async () => {
      try {
        const result = await pizzaService.getUsers(userQuery.page, 10, userQuery.nameFilter);
        if (active) setUserList(result);
      } catch {
        if (active) {
          setUserList({ users: [], more: false });
          setUsersError('Unable to load users. Please try again.');
        }
      } finally {
        if (active) setUsersLoading(false);
      }
    })();

    return () => { active = false; };
  }, [props.user, userQuery]);

  React.useEffect(() => {
    (async () => {
      setFranchiseList(await pizzaService.getFranchises(franchisePage, 3, '*'));
    })();
  }, [props.user, franchisePage]);

  function createFranchise() {
    navigate('/admin-dashboard/create-franchise');
  }

  async function closeFranchise(franchise: Franchise) {
    navigate('/admin-dashboard/close-franchise', { state: { franchise: franchise } });
  }

  async function closeStore(franchise: Franchise, store: Store) {
    navigate('/admin-dashboard/close-store', { state: { franchise: franchise, store: store } });
  }

  function deleteUser(user: User) {
    navigate('/admin-dashboard/delete-user', { state: { user } });
  }

  async function filterFranchises() {
    setFranchiseList(await pizzaService.getFranchises(franchisePage, 10, `*${filterFranchiseRef.current?.value}*`));
  }

  function filterUsers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = filterUserRef.current?.value.trim();
    setUserQuery({ page: 1, nameFilter: name ? `*${name}*` : '*' });
  }

  let response = <NotFound />;
  if (Role.isRole(props.user, Role.Admin)) {
    response = (
      <View title="Mama Ricci's kitchen">
        <div className="text-start py-8 px-4 sm:px-6 lg:px-8">
          <h3 className="text-neutral-100 text-xl">Franchises</h3>
          <div className="bg-neutral-100 overflow-clip my-4">
            <div className="flex flex-col">
              <div className="-m-1.5 overflow-x-auto">
                <div className="p-1.5 min-w-full inline-block align-middle">
                  <div className="overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="uppercase text-neutral-100 bg-slate-400 border-b-2 border-gray-500">
                        <tr>
                          {['Franchise', 'Franchisee', 'Store', 'Revenue', 'Action'].map((header) => (
                            <th key={header} scope="col" className="px-6 py-3 text-center text-xs font-medium">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      {franchiseList.franchises.map((franchise, findex) => {
                        return (
                          <tbody key={findex} className="divide-y divide-gray-200">
                            <tr className="border-neutral-500 border-t-2">
                              <td className="text-start px-2 whitespace-nowrap text-l font-mono text-orange-600">{franchise.name}</td>
                              <td className="text-start px-2 whitespace-nowrap text-sm font-normal text-gray-800" colSpan={3}>
                                {franchise.admins?.map((o) => o.name).join(', ')}
                              </td>
                              <td className="px-6 py-1 whitespace-nowrap text-end text-sm font-medium">
                                <button type="button" className="px-2 py-1 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-1 border-orange-400 text-orange-400  hover:border-orange-800 hover:text-orange-800" onClick={() => closeFranchise(franchise)}>
                                  <TrashIcon />
                                  Close
                                </button>
                              </td>
                            </tr>

                            {franchise.stores.map((store, sindex) => {
                              return (
                                <tr key={sindex} className="bg-neutral-100">
                                  <td className="text-end px-2 whitespace-nowrap text-sm text-gray-800" colSpan={3}>
                                    {store.name}
                                  </td>
                                  <td className="text-end px-2 whitespace-nowrap text-sm text-gray-800">{store.totalRevenue?.toLocaleString()} ₿</td>
                                  <td className="px-6 py-1 whitespace-nowrap text-end text-sm font-medium">
                                    <button type="button" className="px-2 py-1 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-1 border-orange-400 text-orange-400 hover:border-orange-800 hover:text-orange-800" onClick={() => closeStore(franchise, store)}>
                                      <TrashIcon />
                                      Close
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        );
                      })}
                      <tfoot>
                        <tr>
                          <td className="px-1 py-1">
                            <input type="text" ref={filterFranchiseRef} name="filterFranchise" placeholder="Filter franchises" className="px-2 py-1 text-sm border border-gray-300 rounded-lg" />
                            <button type="submit" className="ml-2 px-2 py-1 text-sm font-semibold rounded-lg border border-orange-400 text-orange-400 hover:border-orange-800 hover:text-orange-800" onClick={filterFranchises}>
                              Submit
                            </button>
                          </td>
                          <td colSpan={4} className="text-end text-sm font-medium">
                            <button className="w-12 p-1 text-sm font-semibold rounded-lg border border-transparent bg-white text-grey border-grey m-1 hover:bg-orange-200 disabled:bg-neutral-300 " onClick={() => setFranchisePage(franchisePage - 1)} disabled={franchisePage <= 0}>
                              «
                            </button>
                            <button className="w-12 p-1 text-sm font-semibold rounded-lg border border-transparent bg-white text-grey border-grey m-1 hover:bg-orange-200 disabled:bg-neutral-300" onClick={() => setFranchisePage(franchisePage + 1)} disabled={!franchiseList.more}>
                              »
                            </button>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div>
          <Button className="w-36 text-xs sm:text-sm sm:w-64" title="Add Franchise" onPress={createFranchise} />
        </div>
        <div className="text-start py-8 px-4 sm:px-6 lg:px-8">
          <h3 className="text-neutral-100 text-xl">Users</h3>
          {usersError && <p role="alert" className="my-2 text-orange-400">{usersError}</p>}
          <form onSubmit={filterUsers} className="bg-neutral-100 overflow-clip my-4">
            <div className="flex flex-col">
              <div className="-m-1.5 overflow-x-auto">
                <div className="p-1.5 min-w-full inline-block align-middle">
                  <div className="overflow-hidden">
                    <table aria-label="Users" aria-busy={usersLoading} className="min-w-full divide-y divide-gray-200">
                      <thead className="uppercase text-neutral-100 bg-slate-400 border-b-2 border-gray-500">
                        <tr>
                          {['ID', 'Name', 'Email', 'Action'].map((header) => (
                            <th key={header} scope="col" className="px-6 py-3 text-center text-xs font-medium">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {userList.users.map((user) => (
                          <tr key={user.id} className="bg-neutral-100">
                            <td className="text-start px-2 py-2 whitespace-nowrap text-sm text-gray-800">{user.id}</td>
                            <td className="text-start px-2 py-2 whitespace-nowrap text-l font-mono text-orange-600">{user.name}</td>
                            <td className="text-start px-2 py-2 whitespace-nowrap text-sm text-gray-800">{user.email}</td>
                            <td className="px-6 py-1 whitespace-nowrap text-end text-sm font-medium">
                              <button type="button" className="px-2 py-1 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-1 border-orange-400 text-orange-400 hover:border-orange-800 hover:text-orange-800" onClick={() => deleteUser(user)}>
                                <TrashIcon />
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        {usersLoading && <tr><td colSpan={4} className="px-2 py-2 text-sm text-gray-800">Loading users…</td></tr>}
                        {!usersLoading && !usersError && userList.users.length === 0 && <tr><td colSpan={4} className="px-2 py-2 text-sm text-gray-800">No users found.</td></tr>}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} className="px-1 py-1">
                            <input type="text" ref={filterUserRef} name="filterUser" aria-label="Filter users by name" placeholder="Filter users" className="px-2 py-1 text-sm border border-gray-300 rounded-lg" />
                            <button type="submit" aria-label="Apply user filter" className="ml-2 px-2 py-1 text-sm font-semibold rounded-lg border border-orange-400 text-orange-400 hover:border-orange-800 hover:text-orange-800">Submit</button>
                          </td>
                          <td className="text-end text-sm font-medium whitespace-nowrap">
                            <span className="px-2 text-gray-800">Page {userQuery.page}</span>
                            <button type="button" aria-label="Previous user page" className="w-12 p-1 text-sm font-semibold rounded-lg border border-transparent bg-white text-grey border-grey m-1 hover:bg-orange-200 disabled:bg-neutral-300" onClick={() => setUserQuery((query) => ({ ...query, page: query.page - 1 }))} disabled={usersLoading || userQuery.page <= 1}>«</button>
                            <button type="button" aria-label="Next user page" className="w-12 p-1 text-sm font-semibold rounded-lg border border-transparent bg-white text-grey border-grey m-1 hover:bg-orange-200 disabled:bg-neutral-300" onClick={() => setUserQuery((query) => ({ ...query, page: query.page + 1 }))} disabled={usersLoading || !userList.more}>»</button>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </View>
    );
  }

  return response;
}
